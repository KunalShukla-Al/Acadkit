import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ORIGINAL_VAPID_PUBLIC_KEY,
  PUSH_ENDPOINT_KEY,
  VAPID_PUBLIC_KEY,
  onCurrentKey,
  pushKeyAction,
  sameKey,
  urlBase64ToUint8Array,
  type PushSub,
} from "@/lib/push";

const NEW = urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer;
const OLD = urlBase64ToUint8Array(ORIGINAL_VAPID_PUBLIC_KEY).buffer;

describe("sameKey", () => {
  it("compares the bytes, not the encoding", () => {
    expect(sameKey(NEW, VAPID_PUBLIC_KEY)).toBe(true);
    expect(sameKey(OLD, ORIGINAL_VAPID_PUBLIC_KEY)).toBe(true);
    // The same key with base64 padding decodes to the same bytes.
    expect(sameKey(NEW, VAPID_PUBLIC_KEY + "=")).toBe(true);
  });

  it("tells the two keys apart", () => {
    expect(sameKey(OLD, VAPID_PUBLIC_KEY)).toBe(false);
    expect(sameKey(NEW, ORIGINAL_VAPID_PUBLIC_KEY)).toBe(false);
  });

  it("is false for a key of another length, even a prefix", () => {
    expect(sameKey(NEW.slice(0, 32), VAPID_PUBLIC_KEY)).toBe(false);
    expect(sameKey(new ArrayBuffer(0), VAPID_PUBLIC_KEY)).toBe(false);
  });

  it("reads a view over part of a buffer", () => {
    const padded = new Uint8Array(NEW.byteLength + 8);
    padded.set(new Uint8Array(NEW), 4);
    expect(sameKey(new Uint8Array(padded.buffer, 4, NEW.byteLength), VAPID_PUBLIC_KEY)).toBe(true);
  });

  it("is null when the browser doesn't say", () => {
    expect(sameKey(null, VAPID_PUBLIC_KEY)).toBeNull();
    expect(sameKey(undefined, VAPID_PUBLIC_KEY)).toBeNull();
  });
});

describe("onCurrentKey", () => {
  it("goes by the subscription's key when there is one, whatever was recorded", () => {
    expect(onCurrentKey(NEW, null)).toBe(true);
    expect(onCurrentKey(NEW, ORIGINAL_VAPID_PUBLIC_KEY)).toBe(true);
    expect(onCurrentKey(OLD, VAPID_PUBLIC_KEY)).toBe(false);
  });

  it("falls back to the recorded key", () => {
    expect(onCurrentKey(null, VAPID_PUBLIC_KEY)).toBe(true);
    expect(onCurrentKey(null, ORIGINAL_VAPID_PUBLIC_KEY)).toBe(false);
  });

  it("takes nothing recorded as the original key", () => {
    expect(onCurrentKey(null, null)).toBe(false);
  });

  it("doesn't know when storage is off too", () => {
    expect(onCurrentKey(null, undefined)).toBeNull();
  });
});

describe("pushKeyAction", () => {
  const base = {
    supported: true,
    permission: "granted" as NotificationPermission,
    subscription: { endpoint: "https://push.test/a", applicationServerKey: OLD },
    storedKey: null,
    storedEndpoint: "https://push.test/a",
  };

  it("moves a subscription on the original key", () => {
    expect(pushKeyAction(base)).toBe("resubscribe");
    expect(pushKeyAction({ ...base, storedEndpoint: null })).toBe("resubscribe");
    expect(pushKeyAction({ ...base, storedEndpoint: undefined, storedKey: undefined })).toBe(
      "resubscribe"
    );
  });

  it("leaves one on the current key alone", () => {
    const current = { ...base, subscription: { ...base.subscription, applicationServerKey: NEW } };
    expect(pushKeyAction(current)).toBe("none");
    expect(pushKeyAction({ ...current, storedEndpoint: null })).toBe("none");
    expect(pushKeyAction({ ...current, storedEndpoint: undefined })).toBe("none");
  });

  it("saves one on the current key whose row never was", () => {
    const moved = {
      ...base,
      subscription: { endpoint: "https://push.test/b", applicationServerKey: NEW },
      storedEndpoint: "https://push.test/a",
    };
    expect(pushKeyAction(moved)).toBe("resave");
  });

  it("does nothing without permission, support or a subscription", () => {
    expect(pushKeyAction({ ...base, permission: "default" })).toBe("none");
    expect(pushKeyAction({ ...base, permission: "denied" })).toBe("none");
    expect(pushKeyAction({ ...base, permission: undefined })).toBe("none");
    expect(pushKeyAction({ ...base, supported: false })).toBe("none");
    expect(pushKeyAction({ ...base, subscription: null })).toBe("none");
  });

  it("goes by the recorded key when the browser doesn't report one", () => {
    const silent = { ...base, subscription: { ...base.subscription, applicationServerKey: null } };
    expect(pushKeyAction({ ...silent, storedKey: null })).toBe("resubscribe");
    expect(pushKeyAction({ ...silent, storedKey: ORIGINAL_VAPID_PUBLIC_KEY })).toBe("resubscribe");
    expect(pushKeyAction({ ...silent, storedKey: VAPID_PUBLIC_KEY })).toBe("none");
  });

  it("waits for a connection before moving", () => {
    expect(pushKeyAction({ ...base, online: false })).toBe("none");
    expect(pushKeyAction({ ...base, online: true })).toBe("resubscribe");
  });

  it("puts back a subscription a move dropped and couldn't replace", () => {
    const dropped = { ...base, subscription: null, interrupted: "https://push.test/a" };
    expect(pushKeyAction(dropped)).toBe("resubscribe");
    expect(pushKeyAction({ ...dropped, online: false })).toBe("none");
    expect(pushKeyAction({ ...dropped, permission: "default" })).toBe("none");
    expect(pushKeyAction({ ...dropped, interrupted: null })).toBe("none");
    expect(pushKeyAction({ ...dropped, interrupted: undefined })).toBe("none");
  });

  it("does nothing when it can't tell which key (no key reported, storage off)", () => {
    const silent = {
      ...base,
      subscription: { ...base.subscription, applicationServerKey: null },
      storedKey: undefined,
      storedEndpoint: undefined,
    };
    expect(pushKeyAction(silent)).toBe("none");
  });
});

// ---------------------------------------------------------------------------
// movePushToCurrentKey against a fake browser
// ---------------------------------------------------------------------------

interface FakeSub {
  endpoint: string;
  options: { applicationServerKey: ArrayBuffer | null };
  unsubscribe: () => Promise<boolean>;
  toJSON: () => { keys: { p256dh: string; auth: string } };
}

function fakeBrowser(opts: {
  permission?: NotificationPermission;
  start: { endpoint: string; key: ArrayBuffer | null } | null;
  /** Keys pushManager.subscribe refuses. */
  refuse?: string[];
  /**
   * Like Chrome: unsubscribe() on any object drops the worker's current
   * subscription, and takes a moment to reach the push service.
   */
  staleUnsubscribeDrops?: boolean;
  /** Give navigator a Web Locks stand-in shared by every "tab". */
  locks?: boolean;
  /** navigator.onLine; left out, the browser doesn't say. */
  online?: boolean;
  /** The push service hands back the endpoint it had before. */
  sameEndpoint?: boolean;
}) {
  let n = 0;
  let current: FakeSub | null = null;
  const log: string[] = [];
  const make = (endpoint: string, key: ArrayBuffer | null): FakeSub => {
    const sub: FakeSub = {
      endpoint,
      options: { applicationServerKey: key },
      unsubscribe: async () => {
        log.push(`unsubscribe ${endpoint}`);
        if (opts.staleUnsubscribeDrops) await new Promise((r) => setTimeout(r, 5));
        if (current === sub || opts.staleUnsubscribeDrops) current = null;
        return true;
      },
      toJSON: () => ({ keys: { p256dh: `p256dh-${endpoint}`, auth: `auth-${endpoint}` } }),
    };
    return sub;
  };
  if (opts.start) current = make(opts.start.endpoint, opts.start.key);
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async ({ applicationServerKey }: { applicationServerKey: Uint8Array }) => {
      const key = applicationServerKey.buffer as ArrayBuffer;
      const which = sameKey(key, VAPID_PUBLIC_KEY) ? VAPID_PUBLIC_KEY : ORIGINAL_VAPID_PUBLIC_KEY;
      log.push(`subscribe ${which === VAPID_PUBLIC_KEY ? "new" : "old"}`);
      // Same key: the browser hands back the subscription it has.
      if (current && sameKey(current.options.applicationServerKey, which)) return current;
      if (current) throw new Error("InvalidStateError: already subscribed");
      if (opts.refuse?.includes(which)) throw new Error("AbortError: push service unreachable");
      current = make(opts.sameEndpoint && opts.start ? opts.start.endpoint : `https://push.test/${++n}`, key);
      return current;
    },
  };
  const reg = { pushManager };
  const requestPermission = vi.fn();
  vi.stubGlobal("window", { PushManager: class {}, Notification: class {} });
  let tail: Promise<unknown> = Promise.resolve();
  const locks = {
    request: (_name: string, fn: () => Promise<unknown>) => {
      const run = tail.then(fn);
      tail = run.catch(() => {});
      return run;
    },
  };
  vi.stubGlobal("navigator", {
    userAgent: "test",
    serviceWorker: { getRegistration: async () => reg, ready: Promise.resolve(reg) },
    ...(opts.locks ? { locks } : {}),
    ...(opts.online === undefined ? {} : { onLine: opts.online }),
  });
  vi.stubGlobal("Notification", { permission: opts.permission ?? "granted", requestPermission });
  return { log, requestPermission, current: () => current };
}

function fakeStore(opts: { failSave?: boolean } = {}) {
  const rows = new Map<string, PushSub>();
  const calls: string[] = [];
  return {
    rows,
    calls,
    save: vi.fn(async (sub: PushSub) => {
      calls.push(`save ${sub.endpoint} ${sub.vapidPublic === VAPID_PUBLIC_KEY ? "new" : String(sub.vapidPublic)}`);
      if (opts.failSave) throw new Error("offline");
      rows.set(sub.endpoint, sub);
      localStorage.setItem(PUSH_ENDPOINT_KEY, sub.endpoint);
    }),
    remove: vi.fn(async (endpoint: string) => {
      calls.push(`remove ${endpoint}`);
      rows.delete(endpoint);
    }),
  };
}

async function loadPush() {
  vi.resetModules();
  return import("@/lib/push");
}

describe("movePushToCurrentKey", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves a subscription on the original key, saves the new row and drops the old one", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD } });
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/old");
    const store = fakeStore();
    const push = await loadPush();

    await expect(push.movePushToCurrentKey(store)).resolves.toBe(true);

    expect(browser.log).toEqual(["unsubscribe https://push.test/old", "subscribe new"]);
    expect(store.calls).toEqual(["save https://push.test/1 new", "remove https://push.test/old"]);
    // Nothing left saying a move is half done.
    expect(localStorage.getItem("acadkit:push-moving")).toBeNull();
    expect(store.rows.get("https://push.test/1")).toMatchObject({
      p256dh: "p256dh-https://push.test/1",
      auth: "auth-https://push.test/1",
      vapidPublic: VAPID_PUBLIC_KEY,
    });
    expect(browser.requestPermission).not.toHaveBeenCalled();
  });

  it("does it once: the next load finds it on the current key", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD } });
    const store = fakeStore();
    const push = await loadPush();
    await push.movePushToCurrentKey(store);
    await push.movePushToCurrentKey(store);
    await push.movePushToCurrentKey(store);
    expect(browser.log.filter((l) => l.startsWith("subscribe"))).toHaveLength(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("runs one move at a time when called twice at once", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD } });
    const store = fakeStore();
    const push = await loadPush();
    await Promise.all([push.movePushToCurrentKey(store), push.movePushToCurrentKey(store)]);
    expect(browser.log.filter((l) => l.startsWith("subscribe"))).toHaveLength(1);
  });

  it("moves once across two tabs opened at the same time, keeping the live row", async () => {
    const browser = fakeBrowser({
      start: { endpoint: "https://push.test/old", key: OLD },
      staleUnsubscribeDrops: true,
      locks: true,
    });
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/old");
    // One database for both tabs, saving the way savePushSubscription does:
    // upsert, then drop the endpoint this browser saved before. The first
    // save is the slow one.
    const rows = new Set<string>(["https://push.test/old"]);
    let saves = 0;
    const store = {
      save: async (sub: PushSub) => {
        const delay = saves++ === 0 ? 20 : 0;
        await new Promise((r) => setTimeout(r, delay));
        rows.add(sub.endpoint);
        const previous = localStorage.getItem(PUSH_ENDPOINT_KEY);
        localStorage.setItem(PUSH_ENDPOINT_KEY, sub.endpoint);
        if (previous && previous !== sub.endpoint) rows.delete(previous);
      },
      remove: async (endpoint: string) => {
        rows.delete(endpoint);
      },
    };
    const tabA = await loadPush();
    const tabB = await loadPush();

    await Promise.all([tabA.movePushToCurrentKey(store), tabB.movePushToCurrentKey(store)]);

    expect(browser.log.filter((l) => l.startsWith("subscribe"))).toHaveLength(1);
    expect([...rows]).toEqual([browser.current()?.endpoint]);
  });

  it("keeps the row when the push service hands back the same endpoint", async () => {
    fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD }, sameEndpoint: true });
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/old");
    const store = fakeStore();
    const push = await loadPush();
    await push.movePushToCurrentKey(store);
    expect(store.calls).toEqual(["save https://push.test/old new"]);
    expect(store.rows.get("https://push.test/old")?.vapidPublic).toBe(VAPID_PUBLIC_KEY);
  });

  it("leaves a subscription on the current key alone", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/new", key: NEW } });
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/new");
    const store = fakeStore();
    const push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(true);
    expect(browser.log).toEqual([]);
    expect(store.calls).toEqual([]);
  });

  it("does nothing without permission or a subscription", async () => {
    for (const permission of ["default", "denied"] as const) {
      const browser = fakeBrowser({ permission, start: { endpoint: "https://push.test/old", key: OLD } });
      const store = fakeStore();
      const push = await loadPush();
      await push.movePushToCurrentKey(store);
      expect(browser.log).toEqual([]);
      expect(store.calls).toEqual([]);
      expect(browser.requestPermission).not.toHaveBeenCalled();
    }
    const browser = fakeBrowser({ start: null });
    const store = fakeStore();
    const push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(false);
    expect(browser.log).toEqual([]);
    expect(store.calls).toEqual([]);
  });

  it("does nothing where push isn't supported", async () => {
    const store = fakeStore();
    const push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(false);
    expect(store.calls).toEqual([]);
  });

  it("goes back on the original key if the current one can't be subscribed", async () => {
    const browser = fakeBrowser({
      start: { endpoint: "https://push.test/old", key: OLD },
      refuse: [VAPID_PUBLIC_KEY],
    });
    const store = fakeStore();
    const push = await loadPush();

    await expect(push.movePushToCurrentKey(store)).resolves.toBe(true);
    expect(browser.log).toEqual(["unsubscribe https://push.test/old", "subscribe new", "subscribe old"]);
    expect(store.calls).toEqual(["save https://push.test/1 null", "remove https://push.test/old"]);
    expect(sameKey(browser.current()?.options.applicationServerKey, ORIGINAL_VAPID_PUBLIC_KEY)).toBe(true);
  });

  it("leaves the subscription alone while offline", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD }, online: false });
    const store = fakeStore();
    const push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(true);
    expect(browser.log).toEqual([]);
    expect(store.calls).toEqual([]);
  });

  it("subscribes again on the next load when neither key could be subscribed", async () => {
    const refuse = [VAPID_PUBLIC_KEY, ORIGINAL_VAPID_PUBLIC_KEY];
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD }, refuse });
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/old");
    const store = fakeStore();
    let push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(false);
    expect(browser.current()).toBeNull();
    expect(store.calls).toEqual([]);

    // The push service is back.
    refuse.length = 0;
    push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(true);
    expect(store.calls).toEqual(["save https://push.test/1 new", "remove https://push.test/old"]);
    expect(browser.requestPermission).not.toHaveBeenCalled();

    // ...once.
    push = await loadPush();
    await push.movePushToCurrentKey(store);
    expect(browser.log.filter((l) => l === "subscribe new")).toHaveLength(2);
  });

  it("doesn't put back reminders turned off after a move was cut short", async () => {
    const refuse = [VAPID_PUBLIC_KEY, ORIGINAL_VAPID_PUBLIC_KEY];
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD }, refuse });
    let push = await loadPush();
    await push.movePushToCurrentKey(fakeStore());
    // Signing out (or turning reminders off) on this browser.
    await push.unsubscribeFromPush();

    refuse.length = 0;
    const store = fakeStore();
    push = await loadPush();
    await expect(push.movePushToCurrentKey(store)).resolves.toBe(false);
    expect(browser.current()).toBeNull();
    expect(store.calls).toEqual([]);
  });

  it("saves on the next load what a failed save left unsaved", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD } });
    localStorage.setItem(PUSH_ENDPOINT_KEY, "https://push.test/old");
    const offline = fakeStore({ failSave: true });
    let push = await loadPush();

    // Never throws, even with the save failing.
    await expect(push.movePushToCurrentKey(offline)).resolves.toBe(true);
    expect(offline.calls).toEqual(["save https://push.test/1 new"]);

    const online = fakeStore();
    push = await loadPush();
    await push.movePushToCurrentKey(online);
    expect(online.calls).toEqual(["save https://push.test/1 new"]);
    expect(browser.log.filter((l) => l.startsWith("subscribe"))).toHaveLength(1);

    // ...and then it's settled.
    await push.movePushToCurrentKey(online);
    expect(online.calls).toHaveLength(1);
  });

  it("saves on the next load even when this browser never recorded an endpoint", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD } });
    let push = await loadPush();
    await push.movePushToCurrentKey(fakeStore({ failSave: true }));

    const online = fakeStore();
    push = await loadPush();
    await push.movePushToCurrentKey(online);
    expect(online.calls).toEqual(["save https://push.test/1 new"]);
    expect(browser.log.filter((l) => l.startsWith("subscribe"))).toHaveLength(1);
  });

  it("uses the recorded key for a browser that doesn't report one", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: null } });
    const store = fakeStore();
    const push = await loadPush();
    await push.movePushToCurrentKey(store);
    expect(browser.log).toEqual(["unsubscribe https://push.test/old", "subscribe new"]);
    expect(localStorage.getItem("acadkit:push-key")).toBe(VAPID_PUBLIC_KEY);
  });
});

describe("subscribeToPush", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("subscribes on the current key", async () => {
    const browser = fakeBrowser({ start: null });
    browser.requestPermission.mockResolvedValue("granted");
    const push = await loadPush();
    await expect(push.subscribeToPush()).resolves.toMatchObject({
      endpoint: "https://push.test/1",
      vapidPublic: VAPID_PUBLIC_KEY,
    });
  });

  it("replaces a subscription still on the original key instead of saving it as current", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/old", key: OLD } });
    browser.requestPermission.mockResolvedValue("granted");
    const push = await loadPush();
    await expect(push.subscribeToPush()).resolves.toMatchObject({
      endpoint: "https://push.test/1",
      vapidPublic: VAPID_PUBLIC_KEY,
    });
    expect(browser.log).toEqual(["unsubscribe https://push.test/old", "subscribe new"]);
  });

  it("reuses one already on the current key", async () => {
    const browser = fakeBrowser({ start: { endpoint: "https://push.test/new", key: NEW } });
    browser.requestPermission.mockResolvedValue("granted");
    const push = await loadPush();
    await expect(push.subscribeToPush()).resolves.toMatchObject({
      endpoint: "https://push.test/new",
      vapidPublic: VAPID_PUBLIC_KEY,
    });
    expect(browser.log).toEqual([]);
  });
});
