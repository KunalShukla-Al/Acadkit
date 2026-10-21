/**
 * Which VAPID pair signs a push. No Deno or npm imports, so Vitest can
 * load it.
 *
 * The original pair (VAPID_PUBLIC / VAPID_PRIVATE) signs every subscription
 * made before October 2026. Its private half exists only as this
 * function's secret, so the app moves each browser onto a new key
 * (src/lib/push.ts) and records it in push_subscriptions.vapid_public
 * (migration 041). Those rows are signed with VAPID_PUBLIC_V2 /
 * VAPID_PRIVATE_V2. A push signed with the wrong pair is refused by the
 * push service, so the choice is per subscription.
 *
 * Without both V2 secrets every push is signed with the original pair,
 * exactly as before.
 */

export interface VapidPair {
  publicKey: string;
  privateKey: string;
}

export interface VapidKeys {
  subject: string;
  original: VapidPair;
  /** null unless both VAPID_PUBLIC_V2 and VAPID_PRIVATE_V2 are set. */
  v2: VapidPair | null;
}

/** web-push's per-call `vapidDetails`. */
export interface VapidDetails extends VapidPair {
  subject: string;
}

const DEFAULT_SUBJECT = "mailto:acadkit@example.com";

/** The keys from the function's secrets (`get` is Deno.env.get). */
export function vapidKeys(get: (name: string) => string | undefined): VapidKeys {
  // The app stores the bare base64url key: no padding, no line break.
  const v2Public = get("VAPID_PUBLIC_V2")?.trim().replace(/=+$/, "");
  const v2Private = get("VAPID_PRIVATE_V2")?.trim();
  return {
    subject: get("VAPID_SUBJECT") || DEFAULT_SUBJECT,
    original: { publicKey: get("VAPID_PUBLIC")!, privateKey: get("VAPID_PRIVATE")! },
    v2: v2Public && v2Private ? { publicKey: v2Public, privateKey: v2Private } : null,
  };
}

/**
 * The pair for this subscription: V2 when it was made with V2's public key
 * and V2 is set, else the original (vapid_public null, missing before
 * migration 041, or a key this function doesn't hold).
 */
export function vapidFor(
  sub: { vapid_public?: string | null },
  keys: VapidKeys
): VapidDetails {
  const pair = keys.v2 && sub.vapid_public === keys.v2.publicKey ? keys.v2 : keys.original;
  return { subject: keys.subject, publicKey: pair.publicKey, privateKey: pair.privateKey };
}
