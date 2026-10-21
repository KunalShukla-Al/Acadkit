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
        { name: "Transcribe", run: async () => "2 lectures" },
        { name: "Read", run: async () => Promise.reject(new Error("Ollama is down")) },
        { name: "Sync", run: async () => "" },
      ],
      { log: (l: string) => lines.push(l) }
    );
    expect(done.map((d: { name: string; said?: string; error?: string }) => [d.name, d.said ?? d.error])).toEqual([["Transcribe", "2 lectures"], ["Read", "Ollama is down"], ["Sync", ""]]);
    expect(lines).toEqual(["Transcribe: 2 lectures", "Read failed: Ollama is down", "Sync: nothing to do"]);
  });
});

describe("the night's steps", () => {
  const libs = (over: Record<string, unknown> = {}) => ({
    recorder: async (o: { perTick: number }) => (o.perTick === Infinity ? [{ name: "a" }, { name: "b" }] : []),
    handler: () => async () => ({}),
    recorderMissing: () => null,
    syncLectures: async () => [],
    isPaused: () => false,
    modelReady: async () => true,
    readNew: async (o: { perTick: number }) => (o.perTick === Infinity ? [1, 2, 3, 4, 5] : []),
    autopilotFolders: () => [],
    fileInbox: async () => 3,
    contentReader: async () => async () => null,
    filer: () => async () => {},
    addAccepted: async () => ["os-es-2025-12-2"],
    ...over,
  });

  it("transcribe every recording and read every file waiting, not a tick's share", async () => {
    const [transcribe, read] = nightSteps({ supabase: {}, pin: "1234", dir: "/study", night: "2026-11-04", libs: libs() });
    expect(await transcribe.run()).toBe("2 lectures transcribed");
    expect(await read.run()).toBe("5 files read, 3 filed, 1 past paper added");
  });

  it("say nothing when there is nothing, and fail when Ollama is away", async () => {
    const [transcribe, read] = nightSteps({ supabase: {}, pin: "1234", dir: "/study", night: "2026-11-04", libs: libs({ recorder: async () => [], isPaused: () => true }) });
    expect([await transcribe.run(), await read.run()]).toEqual(["", ""]);
    const [, away] = nightSteps({ supabase: {}, pin: "1234", dir: "/study", night: "2026-11-04", libs: libs({ modelReady: async () => false }) });
    await expect(away.run()).rejects.toThrow("Ollama isn't serving the model");
  });
});

describe("the morning's report", () => {
  it("says what the night did in a sentence, and which steps failed", () => {
    const steps = [
      { name: "Transcribe", said: "2 lectures transcribed", seconds: 400 },
      { name: "Read", error: "Ollama isn't serving the model", seconds: 1 },
      { name: "Sync", said: "12 files indexed, 96.4 MB saved by shrinking", seconds: 900 },
    ];
    expect(nightReport({ night: "2026-11-04", at: "a", finished: "b", steps })).toEqual({
      night: "2026-11-04", at: "a", finished: "b", said: "2 lectures transcribed; 12 files indexed, 96.4 MB saved by shrinking.", failed: ["Read"],
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
