import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nightReport, nightSteps, runSteps, sendReport, syncFlags, syncSaid, takeLock } from "./night-job.mjs";

let root: string;
beforeEach(async () => (root = await mkdtemp(path.join(tmpdir(), "night-job-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("the tick's lock", () => {
  it("is taken and given back", async () => {
    const lock = path.join(root, "sync.lock");
    const release = await takeLock({ lock, waitMs: 0 });
    expect(existsSync(lock)).toBe(true);
    expect(await takeLock({ lock, waitMs: 0 })).toBeNull();
    await release!();
    expect(existsSync(lock)).toBe(false);
  });

  it("waits for a tick to finish, and takes over a crashed run's", async () => {
    const lock = path.join(root, "sync.lock");
    await mkdir(lock);
    setTimeout(() => void rm(lock, { recursive: true }), 50);
    const release = await takeLock({ lock, waitMs: 5000, poll: 20 });
    expect(release).not.toBeNull();
    await release!();

    await mkdir(lock);
    const old = new Date(Date.now() - 4 * 3_600_000);
    await utimes(lock, old, old);
    const taken = await takeLock({ lock, waitMs: 0 });
    expect(taken).not.toBeNull();
    await taken!();
  });
});

describe("the night's sync", () => {
  it("shrinks more, and indexes everything again on a Saturday night", () => {
    expect(syncFlags("2026-11-04")).toEqual(["--shrink-over=2"]);
    expect(syncFlags("2026-11-07")).toEqual(["--shrink-over=2", "--reindex"]);
  });

  it("says what it did, from its log", () => {
    const out = "Big PDFs: 41 over 2 MB, 23 shrunk for upload, 96.4 MB saved\nSearch index: 812 readable files · 12 to index · 0 to drop\n";
    expect(syncSaid(out)).toEqual({ indexed: 12, savedMB: 96.4 });
    expect(syncSaid("Nothing changed.")).toEqual({ indexed: 0, savedMB: 0 });
  });
});

describe("the steps", () => {
  it("run in order, and one that fails doesn't stop the rest", async () => {
    const lines: string[] = [];
    const done = await runSteps(
      [
        { name: "Shrink", run: async () => "96 MB saved" },
        { name: "Index", run: async () => Promise.reject(new Error("the embedder is down")) },
        { name: "Sync", run: async () => "" },
      ],
      { log: (l: string) => lines.push(l) }
    );
    expect(done.map((d: { name: string; said?: string; error?: string }) => [d.name, d.said ?? d.error])).toEqual([["Shrink", "96 MB saved"], ["Index", "the embedder is down"], ["Sync", ""]]);
    expect(lines).toEqual(["Shrink: 96 MB saved", "Index failed: the embedder is down", "Sync: nothing to do"]);
  });
});

describe("the night's steps", () => {
  it("are the sync alone", () => {
    expect(nightSteps({ night: "2026-11-04" }).map((s: { name: string }) => s.name)).toEqual(["Sync"]);
  });
});

describe("the morning's report", () => {
  it("says what the night did in a sentence, and which steps failed", () => {
    const steps = [
      { name: "Shrink", said: "96 MB saved", seconds: 400 },
      { name: "Index", error: "the embedder is down", seconds: 1 },
      { name: "Sync", said: "12 files indexed, 96.4 MB saved by shrinking", seconds: 900 },
    ];
    expect(nightReport({ night: "2026-11-04", at: "a", finished: "b", steps })).toEqual({
      night: "2026-11-04", at: "a", finished: "b", said: "96 MB saved; 12 files indexed, 96.4 MB saved by shrinking.", failed: ["Index"],
    });
    expect(nightReport({ night: "n", at: "a", finished: "b", steps: [{ name: "Sync", said: "", seconds: 1 }] })).toMatchObject({ said: "", failed: [] });
  });

  it("goes where the push looks for it", async () => {
    const sent: unknown[] = [];
    const supabase = { storage: { from: (bucket: string) => ({ upload: async (key: string, body: string, opts: unknown) => (sent.push([bucket, key, JSON.parse(body), opts]), { error: null }) }) } };
    await sendReport(supabase, "1234", { night: "2026-11-04", said: "x." });
    expect(sent).toEqual([["study-files", "1234/night-shift.json", { night: "2026-11-04", said: "x." }, { contentType: "application/json", upsert: true, cacheControl: "0" }]]);
  });
});
