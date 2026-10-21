import { copyFile, mkdir, mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handler, recorder, recorderMissing } from "./recorder.mjs";
import { transcribe } from "./whisper.mjs";

// An 18-second lecture made with macOS's `say`, and whisper.cpp's JSON for it.
const FIXTURES = path.join(import.meta.dirname, "__fixtures__");
const SAMPLE = path.join(FIXTURES, "lecture-sample.m4a");
const SAID =
  "Today we look at page replacement. When a page fault occurs and memory is full, the operating system must choose a victim page. FIFO replaces the oldest page. LRU replaces the page that was used least recently, and the optimal algorithm replaces the page that will not be used for the longest time.";

// Wednesday 7 Oct 2026 is Day Order 3, with DSA at 10:00 (packages/core/src/today.test.ts).
const AT = new Date("2026-10-07T04:35:00Z");
const subject = (id: string, code: string, name: string) => ({ id, device_id: "1234", code, name, credits: 4, type: "theory", faculty: null, color_hex: "#000" });
const slot = (subject_id: string, day_order: number, start: string, end: string) => ({ id: `${subject_id}-${start}`, device_id: "1234", subject_id, day_order, start_time: `${start}:00`, end_time: `${end}:00`, room: "TP402" });
const TABLES: Record<string, unknown[]> = {
  settings: [{ sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [] }],
  subjects: [subject("os", "21CSC202J", "Operating Systems"), subject("dsa", "21CSC201J", "Data Structures and Algorithms")],
  timetable_slots: [slot("os", 3, "08:00", "08:50"), slot("dsa", 3, "10:00", "10:50")],
};
const supabase = { from: (table: string) => ({ select: () => ({ eq: async () => ({ data: TABLES[table], error: null }) }) }) };

/** Words wrong per word said: the edit distance between the two, over the words said. */
function wordErrorRate(said: string, heard: string) {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const [a, b] = [words(said), words(heard)];
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] / a.length;
}

let root: string;
beforeEach(async () => (root = await mkdtemp(path.join(tmpdir(), "recorder-sample-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("a sample recording, with whisper's recorded answer", () => {
  it("is matched to its class and kept as timed text", async () => {
    const calls: string[][] = [];
    const run = async (cmd: string, args: string[]) => {
      calls.push([cmd, ...args]);
      if (cmd.endsWith("whisper-cli")) await copyFile(path.join(FIXTURES, "lecture-sample.whisper.json"), `${args[args.indexOf("-of") + 1]}.json`);
      return { stdout: "" };
    };
    const speech = (o: { full: string; lang: string }) => transcribe({ ...o, run, ready: () => ({ cli: "/opt/homebrew/bin/whisper-cli", missing: null }) });
    const align = async ({ folder, segments }: { folder: string | null; segments: { start: number; end: number; text: string }[] }) => ({
      deck: `${folder}/02_Notes/Unit_3/Unit3_CPU_Scheduling_Slides.pptx`,
      moments: [{ start: segments[0].start, end: segments.at(-1)!.end, text: "…", page: 24, similarity: 0.91 }],
      vectors: [[0.1, 0.2]],
    });
    const handle = handler({ supabase, pin: "1234", dir: root, env: {}, stateDir: root, speech, align });

    const out = await handle({ name: "20261007 100500-ABCDEF12.m4a", full: SAMPLE, started: AT.toISOString(), seconds: 18 });
    expect(out).toMatchObject({ date: "2026-10-07", time: "10:05", class: { short: "DSA", start: "10:00", end: "10:50" }, words: 53, moments: 1, onSlide: 1, alignError: null });
    expect(calls[0]).toEqual(["/usr/bin/afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1", SAMPLE, expect.stringMatching(/audio\.wav$/)]);
    expect(calls[1].slice(0, 7)).toEqual(["/opt/homebrew/bin/whisper-cli", "-m", expect.stringMatching(/ggml-large-v3-turbo\.bin$/), "-f", expect.stringMatching(/audio\.wav$/), "-l", "en"]);

    const kept = JSON.parse(await readFile(out.transcript, "utf8"));
    expect(kept.segments[0]).toEqual({ start: 0, end: 1.62, text: "Today we look at page replacement." });
    expect(kept.moments).toEqual([{ start: 0, end: 17.76, text: "…", page: 24, similarity: 0.91, vector: [0.1, 0.2] }]);
    expect(wordErrorRate(SAID, kept.segments.map((s: { text: string }) => s.text).join(" "))).toBe(0);
  });
});

// The real thing on this Mac: afinfo, afconvert and whisper.cpp. `npm run test:recorder`.
describe.runIf(process.env.RECORDER_LIVE === "1")("a sample recording, through whisper.cpp", () => {
  it("is picked up, matched and transcribed nearly word for word", { timeout: 180_000 }, async () => {
    expect(recorderMissing()).toBeNull();
    // Voice Memos names a memo by the Mac's local time.
    const p2 = (n: number) => String(n).padStart(2, "0");
    const name = `${AT.getFullYear()}${p2(AT.getMonth() + 1)}${p2(AT.getDate())} ${p2(AT.getHours())}${p2(AT.getMinutes())}00-ABCDEF12.m4a`;
    const dir = path.join(root, "memos");
    await mkdir(dir);
    await copyFile(SAMPLE, path.join(dir, name));
    const settled = new Date(Date.now() - 600_000);
    await utimes(path.join(dir, name), settled, settled);

    const stateDir = path.join(root, "state");
    const lines: string[] = [];
    // A study folder without slides: the moments are made and embedded, on no deck.
    const study = path.join(root, "study");
    await mkdir(study);
    const [done] = await recorder({ env: { RECORDER: "on" }, dir, stateDir, handle: handler({ supabase, pin: "1234", dir: study, env: {}, stateDir }), missing: recorderMissing, log: (l: string) => lines.push(l) });
    expect(done).toMatchObject({ seconds: 18, class: { short: "DSA" }, deck: null, moments: 1, alignError: null });
    const kept = JSON.parse(await readFile(done.transcript, "utf8"));
    expect(kept.moments[0].vector).toHaveLength(384);
    const rate = wordErrorRate(SAID, kept.segments.map((s: { text: string }) => s.text).join(" "));
    console.log(`${lines[0].trim()}; word error rate ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeLessThan(0.05);
  });
});
