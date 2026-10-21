import { describe, expect, it } from "vitest";
import { checkAttendance, checkMarks, importPortalShot } from "./portal-shot.mjs";

const SUBJECTS = [
  { code: "21CSC202J", name: "Operating Systems", short_name: "OS" },
  { code: "21CSC201J", name: "Data Structures and Algorithms", short_name: "DSA" },
  { code: "21MAB201T", name: "Transforms and Boundary Value Problems", short_name: "TBVP" },
];
const att = (code: string, conducted: number, absent: number, percent: number | null) => ({ code, conducted, absent, percent });
const mark = (code: string, test: string, obtained: number, max: number) => ({ code, test, obtained, max });

describe("checking a screenshot's rows", () => {
  it("keeps attendance for a course on the account whose numbers agree, and says why it left the rest out", () => {
    const { kept, dropped } = checkAttendance(
      [
        att("21CSC202J", 48, 12, 75), // 36/48 = 75%
        att("21 csc201j", 50, 5, 90.0),
        att("21MAB201T", 40, 4, 70), // 36/40 is 90%, not 70: misread
        att("21CSC999J", 10, 1, 90),
        att("21CSC202J", 48, 12, 75), // read twice
        att("21CSC201J", 3, 5, null),
      ],
      SUBJECTS
    );
    expect(kept).toEqual([att("21CSC202J", 48, 12, 75), att("21CSC201J", 50, 5, 90)]);
    expect(dropped).toEqual([
      { code: "21MAB201T", why: "70% doesn't match 36 of 40" },
      { code: "21CSC999J", why: "not one of your courses" },
      { code: "21CSC201J", why: "more absences than classes" },
    ]);
  });

  it("keeps marks no more than they are out of, typed by their test's name", () => {
    const { kept, dropped } = checkMarks([mark("21CSC202J", "FT-I", 12.5, 15), mark("21CSC201J", "FJ-II", 16, 15), mark("21CSC999J", "FT-I", 1, 5)], SUBJECTS);
    expect(kept).toEqual([{ subject_code: "21CSC202J", label: "FT-I", marks_obtained: 12.5, max_marks: 15, component_type: "CT" }]);
    expect(dropped.map((d: { why: string }) => d.why)).toEqual(["16 out of 15 can't be", "not one of your courses"]);
  });
});

function fakeSupabase(tables: Record<string, unknown[]> = {}) {
  const writes: { table: string; how: string; rows: Record<string, unknown>[] }[] = [];
  const read = (table: string) => {
    const chain = { eq: () => chain, then: (ok: (r: unknown) => void) => ok({ data: tables[table] ?? [], error: null }) };
    return chain;
  };
  const done = { data: { id: "action-1" }, error: null };
  return {
    writes,
    from: (table: string) => ({
      select: () => read(table),
      upsert: async (rows: Record<string, unknown>[]) => (writes.push({ table, how: "upsert", rows }), { error: null }),
      insert: (rows: Record<string, unknown> | Record<string, unknown>[]) => {
        writes.push({ table, how: "insert", rows: [rows].flat() });
        return Object.assign(Promise.resolve(done), { select: () => ({ single: async () => done }) });
      },
      delete: () => ({ eq: async () => (writes.push({ table, how: "delete", rows: [] }), { error: null }) }),
    }),
  };
}

describe("importing a portal screenshot", () => {
  const page = { images: ["aGk="], text: "" };
  const opts = { pin: "1234", source: "Inbox/IMG_7.PNG", page, subjects: SUBJECTS, today: "2026-11-02" };

  it("writes the kept attendance as snapshots and their history, from a screenshot", async () => {
    const sb = fakeSupabase();
    const ask = async () => ({ attendance: [att("21CSC202J", 48, 12, 75), att("21CSC999J", 1, 0, 100)], marks: [], confidence: 0.92 });
    const done = await importPortalShot({ ...opts, supabase: sb, ask });
    expect(done.said).toBe("Portal from Inbox/IMG_7.PNG: attendance for 1 course; left out 21CSC999J (not one of your courses).");
    expect(sb.writes.map((w) => w.table)).toEqual(["autopilot_actions", "portal_snapshots", "portal_snapshot_history"]);
    expect(sb.writes[1].rows[0]).toMatchObject({ device_id: "1234", subject_code: "21CSC202J", conducted: 48, absent: 12, percentage: 75, as_of: "2026-11-02" });
    expect(sb.writes[2].rows[0]).toMatchObject({ subject_code: "21CSC202J", source: "screenshot" });
  });

  it("records what changed, and every row as it was, before writing", async () => {
    const sb = fakeSupabase({
      portal_snapshots: [{ subject_code: "21CSC202J", conducted: 47, absent: 11, percentage: 76.6, as_of: "2026-10-30", synced_at: "x" }],
      subjects: [{ id: "os", code: "21CSC202J" }, { id: "dsa", code: "21CSC201J" }],
      marks: [{ id: "m1", subject_id: "os", label: "FJ-1", source: "manual", component_type: "CT", marks_obtained: 10, max_marks: 15 }],
    });
    const ask = async () => ({
      attendance: [att("21CSC202J", 48, 12, 75), att("21CSC201J", 50, 5, 90)],
      marks: [mark("21CSC202J", "FJ-I", 11.5, 15), mark("21CSC201J", "FJ-I", 13, 15)],
      confidence: 0.9,
    });
    await importPortalShot({ ...opts, supabase: sb, ask });
    const action = sb.writes[0];
    expect(action.table).toBe("autopilot_actions");
    expect(action.rows[0]).toMatchObject({
      kind: "portal",
      source: "Inbox/IMG_7.PNG",
      said: "Portal: attendance OS 75.0% (was 76.6%), DSA 90.0% (new); marks OS FJ-I 11.5/15 (was 10), DSA FJ-I 13/15 (new).",
    });
    const changes = action.rows[0].changes as { snapshots: { code: string; before: unknown }[]; history: string[]; marks: { id: string; before: unknown }[] };
    expect(changes.snapshots).toEqual([
      { code: "21CSC202J", before: { subject_code: "21CSC202J", conducted: 47, absent: 11, percentage: 76.6, as_of: "2026-10-30", synced_at: "x" } },
      { code: "21CSC201J", before: null },
    ]);
    expect(changes.history).toHaveLength(2);
    expect(changes.marks[0]).toEqual({ id: "m1", before: { label: "FJ-1", source: "manual", component_type: "CT", marks_obtained: 10, max_marks: 15 } });
    expect(changes.marks[1]).toMatchObject({ before: null });
    // The added mark goes in under the id Undo will delete.
    const added = sb.writes.find((w) => w.table === "marks" && w.how === "insert")!.rows[0];
    expect(added.id).toBe(changes.marks[1].id);
  });

  it("lands marks the way a pasted page does: on the test's row when there is one", async () => {
    const sb = fakeSupabase({
      subjects: [{ id: "os", code: "21CSC202J" }, { id: "dsa", code: "21CSC201J" }],
      marks: [{ id: "m1", subject_id: "os", label: "FT-1", source: "manual" }],
    });
    const ask = async () => ({ attendance: [], marks: [mark("21CSC202J", "FT-I", 13, 15), mark("21CSC201J", "FJ-I", 9, 15)], confidence: 0.9 });
    const done = await importPortalShot({ ...opts, supabase: sb, ask });
    expect(done.said).toBe("Portal from Inbox/IMG_7.PNG: 1 mark updated, 1 mark added.");
    expect(sb.writes.map((w) => `${w.how} ${w.table}`)).toEqual(["insert autopilot_actions", "upsert marks", "insert marks"]);
    expect(sb.writes[1].rows[0]).toMatchObject({ id: "m1", subject_id: "os", label: "FT-I", marks_obtained: 13, source: "portal" });
  });

  it("writes nothing when unsure, or when no row is a course of yours", async () => {
    const sb = fakeSupabase();
    const unsure = async () => ({ attendance: [att("21CSC202J", 48, 12, 75)], marks: [], confidence: 0.4 });
    expect((await importPortalShot({ ...opts, source: "Inbox/a.png", supabase: sb, ask: unsure })).said).toBe("Not sure enough of the numbers on Inbox/a.png (40%); nothing imported.");
    const strangers = async () => ({ attendance: [att("21CSC999J", 1, 0, 100)], marks: [], confidence: 0.9 });
    expect((await importPortalShot({ ...opts, source: "Inbox/b.png", supabase: sb, ask: strangers })).said).toBe("Nothing on Inbox/b.png matched your courses; nothing imported.");
    expect(sb.writes).toEqual([]);
  });
});
