/**
 * The Mac's Supabase client, with a limit on every request.
 *
 * Node's fetch waits as long as the other end stays silent, so a request made
 * as the network dropped (the lid closing, Wi-Fi changing) held a whole tick
 * until the watcher stopped it 20 minutes later. With a limit the request
 * fails, its step says so, and the next tick tries again.
 */
import { createClient } from "@supabase/supabase-js";

/** A query, a listing, a small JSON file. */
export const REQUEST_MS = 120_000;

/** A study file going up or coming down: up to 50 MB on a slow link. */
export const TRANSFER_MS = 600_000;

/** How long a request to `url` may take. */
export function limitFor(url) {
  return String(url).includes("/storage/v1/object/") ? TRANSFER_MS : REQUEST_MS;
}

/** `fetchImpl` with that limit on each request, alongside any signal the caller passed. */
export function timedFetch(fetchImpl = globalThis.fetch) {
  return (input, init = {}) => {
    const limit = AbortSignal.timeout(limitFor(input?.url ?? input));
    const signal = init.signal ? AbortSignal.any([init.signal, limit]) : limit;
    return fetchImpl(input, { ...init, signal });
  };
}

/** A service-role client for the Mac's scripts. */
export function macClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false }, global: { fetch: timedFetch() } });
}
