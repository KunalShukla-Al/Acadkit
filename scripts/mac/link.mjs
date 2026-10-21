/**
 * The instant link: the Mac listens on a private Realtime Broadcast channel,
 * mac:<pin>, for the phone's requests (a delete, an upload, a share; see
 * migration 054), so the tick runs as soon as one is made instead of at
 * the next 3-minute check. Broadcast reads nothing from the database's
 * write-ahead log. supabase-js rejoins the channel by itself after a drop,
 * and while it is down the 3-minute tick still picks everything up.
 *
 * On the same channel the Mac tracks Presence as "mac": "awake", or
 * "syncing" while a tick runs. Asleep, its socket drops and so does its
 * presence, which is how the phone tells (migration 055, useMacStatus).
 */

export const REQUEST = "request";
export const channelName = (pin) => `mac:${pin}`;

export const PRESENCE_KEY = "mac";

/**
 * Joins mac:<pin>, calls `onRequest(payload)` for each request heard, and
 * keeps the Mac's presence up to date (`say`). The service role key may
 * join a private channel; the app may only listen to its presence.
 */
export function listen({ supabase, pin, onRequest, log = console.log }) {
  let joined = false;
  let ever = false;
  let presence = { state: "awake", since: new Date().toISOString() };
  const channel = supabase
    .channel(channelName(pin), { config: { private: true, presence: { key: PRESENCE_KEY } } })
    .on("broadcast", { event: REQUEST }, ({ payload }) => onRequest(payload ?? {}))
    .subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        log(`link: ${ever ? "back on" : "listening on"} ${channelName(pin)}`);
        joined = ever = true;
        // Tracked again on every join: a rejoin starts with no presence.
        void channel.track(presence).catch(() => {});
      } else if (status !== "CLOSED") {
        joined = false;
        log(`link: ${status.toLowerCase().replace("_", " ")}${err ? ` (${err.message})` : ""}; rejoining`);
      }
    });
  return {
    stop: () => supabase.removeChannel(channel),
    /** What the phone shows: "awake", or "syncing" while a tick runs. */
    say(state) {
      presence = { state, since: new Date().toISOString() };
      if (joined) void channel.track(presence).catch(() => {});
    },
  };
}

/** What a request says, as the log line: "link: delete from the phone". */
export const heard = (payload) => `link: ${payload.kind ?? "request"} from the phone`;
