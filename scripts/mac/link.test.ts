import { describe, expect, it } from "vitest";
import { channelName, heard, listen } from "./link.mjs";

/** A stand-in for supabase-js's channel API: records the join, and lets a test play the server. */
function fakeRealtime() {
  const joined: { name: string; opts: unknown; event?: string }[] = [];
  let onBroadcast: (msg: { payload?: unknown }) => void = () => {};
  let onStatus: (status: string, err?: Error) => void = () => {};
  const removed: string[] = [];
  const tracked: unknown[] = [];
  const supabase = {
    channel: (name: string, opts: unknown) => {
      const ch = {
        name,
        on: (_type: string, filter: { event: string }, cb: typeof onBroadcast) => ((joined.push({ name, opts, event: filter.event }), (onBroadcast = cb)), ch),
        subscribe: (cb: typeof onStatus) => ((onStatus = cb), ch),
        track: async (p: unknown) => void tracked.push(p),
      };
      return ch;
    },
    removeChannel: async (ch: { name: string }) => void removed.push(ch.name),
  };
  return { supabase, joined, removed, tracked, send: (payload?: unknown) => onBroadcast({ payload }), status: (s: string, e?: Error) => onStatus(s, e) };
}

describe("the instant link", () => {
  it("joins the PIN's private channel and hands on each request", () => {
    const rt = fakeRealtime();
    const requests: unknown[] = [];
    const lines: string[] = [];
    const link = listen({ supabase: rt.supabase, pin: "1234", onRequest: (p: unknown) => requests.push(p), log: (l: string) => lines.push(l) });
    expect(rt.joined).toEqual([{ name: "mac:1234", opts: { config: { private: true, presence: { key: "mac" } } }, event: "request" }]);
    rt.status("SUBSCRIBED");
    rt.send({ kind: "delete" });
    rt.send();
    expect(requests).toEqual([{ kind: "delete" }, {}]);
    rt.status("CHANNEL_ERROR", new Error("socket closed"));
    rt.status("SUBSCRIBED");
    expect(lines).toEqual(["link: listening on mac:1234", "link: channel error (socket closed); rejoining", "link: back on mac:1234"]);
    void link.stop();
    expect(rt.removed).toEqual(["mac:1234"]);
  });

  it("tells the phone it is awake, or syncing, and again after every rejoin", () => {
    const rt = fakeRealtime();
    const link = listen({ supabase: rt.supabase, pin: "1234", onRequest: () => {}, log: () => {} });
    link.say("syncing");
    expect(rt.tracked).toEqual([]);
    rt.status("SUBSCRIBED");
    link.say("awake");
    rt.status("TIMED_OUT");
    link.say("syncing");
    rt.status("SUBSCRIBED");
    expect(rt.tracked.map((p) => (p as { state: string }).state)).toEqual(["syncing", "awake", "syncing"]);
  });

  it("says what it heard", () => {
    expect(channelName("1234")).toBe("mac:1234");
    expect(heard({ kind: "upload" })).toBe("link: upload from the phone");
    expect(heard({})).toBe("link: request from the phone");
  });
});
