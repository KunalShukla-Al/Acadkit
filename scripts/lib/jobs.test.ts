import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergeJobs, reportJobs, tracked } from "./jobs.mjs";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "jobs-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const bucket = () => {
  const sent: { key: string; body: string }[] = [];
  return { sent, supabase: { storage: { from: () => ({ upload: async (key: string, body: string) => (sent.push({ key, body }), { error: null }) }) } } };
};

describe("the Mac's jobs", () => {
  it("note when each ran and how it went, and still throw a failure", async () => {
    const ran: Record<string, unknown> = {};
    await tracked(ran, "autopilot", async () => "paused", () => 5)();
    await expect(tracked(ran, "recorder", async () => { throw new Error("whisper is missing"); }, () => 6)()).rejects.toThrow("whisper");
    expect(ran).toEqual({ autopilot: { at: 5, ok: true, note: "paused" }, recorder: { at: 6, ok: false, note: "whisper is missing" } });
  });

  it("call it a change when a job is new, or starts or stops failing", () => {
    const saved = { sync: { at: 1, ok: true } };
    expect(mergeJobs(saved, { sync: { at: 2, ok: true } }).changed).toBe(false);
    expect(mergeJobs(saved, { sync: { at: 2, ok: false } }).changed).toBe(true);
    expect(mergeJobs(saved, { night: { at: 2, ok: true } })).toEqual({ jobs: { sync: { at: 1, ok: true }, night: { at: 2, ok: true } }, changed: true });
  });

  it("upload at most every 10 minutes unless something changed, keeping the Mac's copy current", async () => {
    const { sent, supabase } = bucket();
    const file = path.join(dir, "jobs.json");
    const at = 1_000_000;
    await reportJobs({ supabase, pin: "1234", ran: { sync: { at, ok: true } }, file, now: at });
    await reportJobs({ supabase, pin: "1234", ran: { sync: { at: at + 60_000, ok: true } }, file, now: at + 60_000 });
    await reportJobs({ supabase, pin: "1234", ran: { sync: { at: at + 120_000, ok: false, note: "x" } }, file, now: at + 120_000 });
    await reportJobs({ supabase, pin: "1234", ran: { sync: { at: at + 11 * 60_000, ok: false } }, file, now: at + 11 * 60_000 });
    expect(sent.map((s) => JSON.parse(s.body).jobs.sync.at)).toEqual([at, at + 120_000]);
    expect(sent[0].key).toBe("1234/jobs.json");
    expect(JSON.parse(await readFile(file, "utf8")).jobs.sync.at).toBe(at + 11 * 60_000);
  });

  it("never throws, whatever the bucket says", async () => {
    const supabase = { storage: { from: () => ({ upload: async () => ({ error: { message: "offline" } }) }) } };
    const said: string[] = [];
    await reportJobs({ supabase, pin: "1234", ran: { sync: { at: 1, ok: true } }, file: path.join(dir, "j.json"), log: (l: string) => said.push(l) });
    expect(said).toEqual(["Couldn't say how the jobs went: offline"]);
  });
});
