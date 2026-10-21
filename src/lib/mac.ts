/** The Mac's state as the phone sees it (useMacStatus, scripts/mac/link.mjs). */
export type MacState = "awake" | "syncing" | "asleep";

/** The Mac's state from the channel's presence: what it tracks as "mac", or asleep when it isn't there. */
export function macState(presence: Record<string, { state?: string }[]>): MacState {
  const state = presence.mac?.[0]?.state;
  return state === "syncing" || state === "awake" ? state : "asleep";
}
