import { describe, expect, it } from "vitest";
import { REQUEST_MS, TRANSFER_MS, limitFor, timedFetch } from "./mac-client.mjs";

describe("limitFor", () => {
  it("gives a file transfer longer than a query", () => {
    expect(limitFor("https://x.supabase.co/storage/v1/object/study-files/0000/blobs/a.pdf")).toBe(TRANSFER_MS);
    expect(limitFor("https://x.supabase.co/rest/v1/deadlines?select=*")).toBe(REQUEST_MS);
    expect(limitFor("https://x.supabase.co/storage/v1/object/list/study-files")).toBe(TRANSFER_MS);
  });
});

describe("timedFetch", () => {
  it("passes a signal on every request", async () => {
    let seen: RequestInit | undefined;
    const fetch = timedFetch(async (_input: unknown, init?: RequestInit) => {
      seen = init;
      return new Response("ok");
    });
    await fetch("https://x.supabase.co/rest/v1/settings", { method: "GET" });
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
    expect(seen?.method).toBe("GET");
  });

  it("still stops when the caller's own signal does", async () => {
    const mine = new AbortController();
    const fetch = timedFetch(
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("stopped")));
        }),
    );
    const pending = fetch("https://x.supabase.co/rest/v1/settings", { signal: mine.signal });
    mine.abort();
    await expect(pending).rejects.toThrow("stopped");
  });

  it("reads the address off a Request too", async () => {
    let seen: RequestInit | undefined;
    const fetch = timedFetch(async (_input: unknown, init?: RequestInit) => {
      seen = init;
      return new Response("ok");
    });
    await fetch(new Request("https://x.supabase.co/storage/v1/object/study-files/a"));
    expect(seen?.signal?.aborted).toBe(false);
  });
});
