/**
 * Web Push client helpers. The VAPID public key is safe to embed; the
 * matching private key lives only as a Supabase Edge Function secret.
 */

/**
 * The key new subscriptions are made with (send-reminders signs them with
 * VAPID_PUBLIC_V2 / VAPID_PRIVATE_V2).
 */
export const VAPID_PUBLIC_KEY =
  "BProUUQEOe5AskZg0hDybsBBEN0pDZYs0y0RE-RIio4mvgZjSmN-xUINLjErE6lfaJQ9IS5pXj8neUKomnSnvy4";

/**
 * The key every subscription was made with until October 2026. Its private
 * half is lost outside Supabase, so the app moves each subscription off it
 * (movePushToCurrentKey). Only used again if that move fails halfway.
 */
export const ORIGINAL_VAPID_PUBLIC_KEY =
  "BBPr8Odr2qN7A9q-IqeNs3N_Pj1E_qnMOl-b6mhSG51wH6_JUl-5r3VoFyeAQ2EGbUAdqwjNBfq7bizwMyp6iQQ";

export const pushSupported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Whether a subscription's applicationServerKey is this base64url key,
 * byte for byte. null when the browser doesn't say which key it was made
 * with (options.applicationServerKey missing).
 */
export function sameKey(
  applicationServerKey: ArrayBuffer | ArrayBufferView | null | undefined,
  base64Key: string
): boolean | null {
  if (!applicationServerKey) return null;
  const a = ArrayBuffer.isView(applicationServerKey)
    ? new Uint8Array(
        applicationServerKey.buffer,
        applicationServerKey.byteOffset,
        applicationServerKey.byteLength
      )
    : new Uint8Array(applicationServerKey);
  const b = urlBase64ToUint8Array(base64Key);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** The VAPID public key it was made with; null = the original key. */
  vapidPublic: string | null;
}

function toJson(sub: PushSubscription, vapidPublic: string | null): PushSub {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    vapidPublic,
  };
}

/**
 * The key this browser last subscribed with, for a browser that doesn't
 * report options.applicationServerKey. undefined when storage is off.
 */
const PUSH_KEY_KEY = "acadkit:push-key";
/**
 * The endpoint this browser last saved, so a replaced one can be removed.
 * Written by savePushSubscription (src/api/push.ts) once a row is saved.
 */
export const PUSH_ENDPOINT_KEY = "acadkit:push-endpoint";
/**
 * Set to the old endpoint while a move has this browser unsubscribed, and
 * cleared once it is subscribed again. Left behind (offline, push service
 * down), it is how the next load knows reminders were on and puts them back.
 */
const PUSH_MOVING_KEY = "acadkit:push-moving";

function readStorage(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

function rememberKey(key: string): void {
  try {
    localStorage.setItem(PUSH_KEY_KEY, key);
    localStorage.removeItem(PUSH_MOVING_KEY);
  } catch {
    /* storage off: applicationServerKey is the only witness */
  }
}

/**
 * Whether a subscription is on the current key: its applicationServerKey,
 * or failing that what this browser recorded subscribing with. null when
 * neither says.
 */
export function onCurrentKey(
  applicationServerKey: ArrayBuffer | ArrayBufferView | null | undefined,
  storedKey: string | null | undefined
): boolean | null {
  const byBytes = sameKey(applicationServerKey, VAPID_PUBLIC_KEY);
  if (byBytes !== null) return byBytes;
  // Storage off: nothing to go on, and guessing "old" would resubscribe on
  // every load.
  if (storedKey === undefined) return null;
  // Nothing recorded: made before keys were recorded, so the original.
  return storedKey === VAPID_PUBLIC_KEY;
}

export type PushKeyAction =
  /** Nothing to do. */
  | "none"
  /**
   * On the original key: unsubscribe, subscribe on the current key, save it.
   * Also a browser a move left with no subscription: subscribe and save.
   */
  | "resubscribe"
  /** On the current key, but its row was never saved (the save after a move failed). */
  | "resave";

/**
 * What the app does about this browser's subscription at start. Never asks
 * for permission and never touches a browser that has no subscription:
 * reminders turned off stay off.
 */
export function pushKeyAction(state: {
  supported: boolean;
  permission: NotificationPermission | undefined;
  subscription: { endpoint: string; applicationServerKey: ArrayBuffer | null } | null;
  /** localStorage acadkit:push-key; undefined when storage is off. */
  storedKey: string | null | undefined;
  /** localStorage acadkit:push-endpoint; undefined when storage is off. */
  storedEndpoint: string | null | undefined;
  /** localStorage acadkit:push-moving: a move unsubscribed and never subscribed again. */
  interrupted?: string | null;
  /** navigator.onLine; false = known offline. */
  online?: boolean;
}): PushKeyAction {
  const { supported, permission, subscription } = state;
  if (!supported || permission !== "granted") return "none";
  // Offline, unsubscribing would leave nothing: subscribing needs the push
  // service. Wait for a load with a connection.
  const online = state.online !== false;
  if (!subscription) {
    // Reminders turned off stay off; only a move cut short is put back.
    return state.interrupted && online ? "resubscribe" : "none";
  }
  const current = onCurrentKey(subscription.applicationServerKey, state.storedKey);
  if (current === false) return online ? "resubscribe" : "none";
  // The last row saved from here is another endpoint: this one was made
  // (by a move) but never saved. No record at all says nothing either way.
  if (current === true && state.storedEndpoint && state.storedEndpoint !== subscription.endpoint) {
    return "resave";
  }
  return "none";
}

/**
 * `getRegistration()`, not `ready`: `ready` never settles on a page with
 * no service worker (the dev server), and signing out waits on this.
 */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function subscribeWith(reg: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  rememberKey(key);
  return sub;
}

/** Ask permission + subscribe. Returns the serializable subscription. */
export async function subscribeToPush(): Promise<PushSub> {
  if (!pushSupported) throw new Error("Push isn't supported on this device/browser");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications permission was denied");

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (
    existing &&
    onCurrentKey(existing.options?.applicationServerKey, readStorage(PUSH_KEY_KEY)) === true
  ) {
    return toJson(existing, VAPID_PUBLIC_KEY);
  }
  // On the original key, or not saying: a browser holds one subscription
  // per worker, and subscribing with another key fails while it exists.
  await existing?.unsubscribe();
  return toJson(await subscribeWith(reg, VAPID_PUBLIC_KEY), VAPID_PUBLIC_KEY);
}

export async function unsubscribeFromPush(): Promise<string | null> {
  // Turned off (or signing out): a move cut short is not to be put back.
  try {
    localStorage.removeItem(PUSH_MOVING_KEY);
  } catch {
    /* storage off: nothing was recorded */
  }
  const sub = await getExistingSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

/** Saving and deleting rows, passed in so this file stays free of the Supabase client. */
export interface PushStore {
  save(sub: PushSub): Promise<void>;
  remove(endpoint: string): Promise<void>;
}

let moving: Promise<boolean> | null = null;

/**
 * Move this browser's subscription onto VAPID_PUBLIC_KEY, if it is on the
 * original key, without asking anything: permission is already granted.
 * Safe on every load: once moved, pushKeyAction says "none". Never throws.
 * Resolves to whether this browser has a subscription afterwards.
 */
export function movePushToCurrentKey(store: PushStore): Promise<boolean> {
  // One at a time: the app shell and Settings both call this on mount.
  moving ??= acrossTabs(() => moveOnce(store)).finally(() => {
    moving = null;
  });
  return moving;
}

/**
 * Runs `fn` under a lock shared by every tab of the app, where the browser
 * has Web Locks. Two tabs opened at once would otherwise both move: in
 * Chrome the second tab's unsubscribe() drops the first tab's new
 * subscription, and whichever save lands last can delete the live row.
 * Under the lock the second tab finds the move done and does nothing.
 */
function acrossTabs<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks?.request) return fn();
  let ran = false;
  return locks
    .request("acadkit:push-key-move", () => {
      ran = true;
      return fn();
    })
    .catch((err: unknown) => {
      // No lock to be had (an opaque origin, say): run unlocked rather than not at all.
      if (!ran) return fn();
      throw err;
    });
}

async function moveOnce(store: PushStore): Promise<boolean> {
  let existing: PushSubscription | null = null;
  try {
    existing = await getExistingSubscription();
    const action = pushKeyAction({
      supported: pushSupported,
      permission: pushSupported ? Notification.permission : undefined,
      subscription: existing && {
        endpoint: existing.endpoint,
        applicationServerKey: existing.options?.applicationServerKey ?? null,
      },
      storedKey: readStorage(PUSH_KEY_KEY),
      storedEndpoint: readStorage(PUSH_ENDPOINT_KEY),
      interrupted: readStorage(PUSH_MOVING_KEY),
      online: navigator.onLine,
    });
    if (action === "none") return !!existing;
    if (action === "resave") {
      if (!existing) return false;
      await store.save(toJson(existing, VAPID_PUBLIC_KEY));
      return true;
    }

    const reg = await navigator.serviceWorker.ready;
    // The row to drop once the new one is saved: this subscription's, or
    // the one a move cut short had unsubscribed.
    const oldEndpoint = existing?.endpoint ?? readStorage(PUSH_MOVING_KEY) ?? null;
    if (existing) {
      // Its row is the one saved last. Recorded before anything changes, so
      // a failed save below shows up as "resave" next time even on a browser
      // that subscribed before endpoints were recorded, and a failed
      // subscribe as a move to finish.
      try {
        localStorage.setItem(PUSH_ENDPOINT_KEY, existing.endpoint);
        localStorage.setItem(PUSH_MOVING_KEY, existing.endpoint);
      } catch {
        /* storage off: a failed save stays unsaved until reminders are turned on again */
      }
      await existing.unsubscribe();
      existing = null;
    }
    let fresh: PushSub;
    try {
      fresh = toJson(await subscribeWith(reg, VAPID_PUBLIC_KEY), VAPID_PUBLIC_KEY);
    } catch {
      // Back on the original key rather than on nothing: reminders keep
      // coming, and the next load tries again.
      fresh = toJson(await subscribeWith(reg, ORIGINAL_VAPID_PUBLIC_KEY), null);
    }
    // If this save fails, acadkit:push-endpoint still names the old
    // endpoint, so the next load saves it ("resave").
    await store.save(fresh);
    if (oldEndpoint && fresh.endpoint !== oldEndpoint) await store.remove(oldEndpoint);
    return true;
  } catch {
    // Best effort, and never in the way of the app. Whatever is left
    // half-done is picked up on the next load.
    try {
      return !!(await getExistingSubscription());
    } catch {
      return !!existing;
    }
  }
}
