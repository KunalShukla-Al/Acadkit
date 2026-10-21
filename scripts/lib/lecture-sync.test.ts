import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lectureRows, syncLectures } from "./lecture-sync.mjs";

const TRANSCRIPT = {
  memo: "20261103 100500-A.m4a",
  date: "2026-11-03",
  time: "10:05",
  seconds: 2880,
  class: { code: "21CSC202J", short: "OS", start: "10:00", end: "10:50" },
  deck: "Operating_Systems/02_Notes/Unit_3/CPU.pptx",
  segments: [{ start: 0, end: 4, text: "Round robin gives" }, { start: 4, end: 9, text: "each process a quantum." }],
  moments: [{ start: 0, end: 9, text: "Round robin gives each process a quantum.", page: 24, similarity: 0.91, vector: [0.1, 0.2] }],
};

/** A Supabase stand-in that keeps what it is sent. */
function fake({ missing = false } = {}) {
  const rows: Record<string, Record<string, unknown>[]> = { lectures: [], lecture_moments: [] };
  const supabase = {
    rows,
    from: (table: string) => ({
      upsert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (missing) return { data: null, error: { code: "PGRST205", message: "no table" } };
            const at = rows[table].findIndex((r) => r.memo === row.memo);
            const kept = { id: at >= 0 ? rows[table][at].id : `l${rows[table].length + 1}`, ...row };
            if (at >= 0) rows[table][at] = kept;
            else rows[table].push(kept);
            return { data: { id: kept.id }, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: async (_: string, id: string) => {
          rows[table] = rows[table].filter((r) => r.lecture_id !== id);
          return { error: null };
        },
      }),
      insert: async (list: Record<string, unknown>[]) => (rows[table].push(...list), { error: null }),
    }),
  };
  return supabase;
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "lecture-sync-"));
  await mkdir(path.join(root, "transcripts"));
  await writeFile(path.join(root, "transcripts", "20261103 100500-A.json"), JSON.stringify(TRANSCRIPT));
});
afterEach(() => rm(root, { recursive: true, force: true }));

describe("transcripts to the app", () => {
  it("sends a lecture and its moments, without whisper's segments", () => {
    const { lecture, moments } = lectureRows("1234", TRANSCRIPT);
    expect(lecture).toEqual({
      device_id: "1234", memo: "20261103 100500-A.m4a", date: "2026-11-03", start_time: "10:05", seconds: 2880,
      subject_code: "21CSC202J", class_start: "10:00", class_end: "10:50", deck: "Operating_Systems/02_Notes/Unit_3/CPU.pptx", words: 7,
    });
    expect(moments).toEqual([{ device_id: "1234", idx: 0, start_s: 0, end_s: 9, content: "Round robin gives each process a quantum.", page: 24, similarity: 0.91, embedding: [0.1, 0.2] }]);
  });

  it("sends each transcript once, and again whole when it changes", async () => {
    const supabase = fake();
    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    expect(await syncLectures({ supabase, pin: "1234", stateDir: root, log })).toEqual(["20261103 100500-A.m4a"]);
    expect(await syncLectures({ supabase, pin: "1234", stateDir: root, log })).toEqual([]);
    expect(supabase.rows.lecture_moments).toHaveLength(1);

    const later = new Date(Date.now() + 60_000);
    await utimes(path.join(root, "transcripts", "20261103 100500-A.json"), later, later);
    expect(await syncLectures({ supabase, pin: "1234", stateDir: root, log })).toEqual(["20261103 100500-A.m4a"]);
    expect([supabase.rows.lectures.length, supabase.rows.lecture_moments.length]).toEqual([1, 1]);
    expect(supabase.rows.lecture_moments[0].lecture_id).toBe("l1");
    expect(lines).toEqual(["  Recorder: sent 20261103 100500-A.m4a to the app, 1 moment", "  Recorder: sent 20261103 100500-A.m4a to the app, 1 moment"]);
  });

  it("waits, quietly, before migration 061", async () => {
    const lines: string[] = [];
    expect(await syncLectures({ supabase: fake({ missing: true }), pin: "1234", stateDir: root, log: (l: string) => lines.push(l) })).toEqual([]);
    expect(lines).toEqual([]);
  });
});
