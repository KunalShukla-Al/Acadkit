import { describe, expect, it } from "vitest";
import { addFromNotice, deadlinesFrom, noticePrompt, saidFor } from "./autopilot-notice.mjs";

const SUBJECTS = [
  { id: "os", code: "21CSC202J", name: "Operating Systems", short_name: "OS" },
  { id: "dsa", code: "21CSC201J", name: "Data Structures and Algorithms", short_name: "DSA" },
];
const SETTINGS = { sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [] };
// 29 Oct is Day Order 2: OS meets at 10:00 for two periods.
const SLOTS = [
  { subject_id: "os", day_order: 2, start_time: "10:00:00", end_time: "10:50:00", slot_type: "theory" },
  { subject_id: "os", day_order: 2, start_time: "10:50:00", end_time: "11:40:00", slot_type: "theory" },
];
const TODAY = "2026-10-21";
const event = (over: Record<string, unknown>) => ({ title: "FT-II", type: "exam", subject: "21CSC202J", date: "2026-10-29", time: null, max_marks: null, ...over });
let n = 0;
const uuid = () => `id-${++n}`;
const from = (events: ReturnType<typeof event>[], deadlines: { subject_id: string | null; due_date: string }[] = []) =>
  deadlinesFrom(events, { pin: "1234", subjects: SUBJECTS, deadlines, slots: SLOTS, settings: SETTINGS, today: TODAY, source: "Inbox/notice.jpg", uuid });

describe("what the model is asked of a notice", () => {
  it("knows today and the courses, and reads dates day first", () => {
    const prompt = noticePrompt({ name: "notice.jpg", text: "", subjects: SUBJECTS, today: TODAY });
    expect(prompt).toContain("Today is Wednesday, 21 October 2026.");
    expect(prompt).toContain("- 21CSC202J: Operating Systems (OS)");
    expect(prompt).toContain("05/11 is 5 November");
  });
});

describe("the deadlines a notice adds", () => {
  it("puts a test without a time at that day's class, and keeps the source", () => {
    const [row] = from([event({})]);
    expect(row).toMatchObject({ device_id: "1234", subject_id: "os", title: "FT-II", type: "exam", priority: "high", status: "pending", source: "Inbox/notice.jpg" });
    expect(row.due_date).toBe(new Date("2026-10-29T10:00:00+05:30").toISOString());
  });

  it("takes the notice's own time, and the end of the day for a submission with no class", () => {
    expect(from([event({ time: "14:30" })])[0].due_date).toBe(new Date("2026-10-29T14:30:00+05:30").toISOString());
    const [lab] = from([event({ title: "Lab record", type: "assignment", subject: null, date: "2026-11-02", max_marks: 10 })]);
    expect(lab).toMatchObject({ subject_id: null, priority: "medium", max_marks: 10 });
    expect(lab.due_date).toBe(new Date("2026-11-02T23:59:00+05:30").toISOString());
  });

  it("skips what is past, too far off, or on the list already", () => {
    const rows = from(
      [
        event({ date: "2026-10-20" }),
        event({ date: "2027-08-01" }),
        event({ subject: "21CSC201J", date: "2026-11-03" }),
        event({}),
        event({ title: "FT-II again" }),
      ],
      [{ subject_id: "dsa", due_date: "2026-11-03T03:30:00.000Z" }]
    );
    expect(rows.map((r) => `${r.subject_id} ${r.title}`)).toEqual(["os FT-II"]);
  });
});

describe("what Autopilot says it did", () => {
  it("names each with its course and day", () => {
    const rows = from([event({}), event({ title: "DSA Lab record", type: "lab", subject: "21CSC201J", date: "2026-11-02", time: "09:00" })]);
    expect(saidFor(rows, SUBJECTS)).toBe("Added OS FT-II (Thu, 29 Oct) and DSA Lab record (Mon, 2 Nov).");
  });
});

/** A stand-in for supabase-js: the tables to read, and what was written, in order. */
function fakeSupabase(tables: Record<string, unknown[]>, fail: string | null = null) {
  const writes: string[] = [];
  const from = (table: string) => ({
    select: () => ({ eq: async () => ({ data: tables[table] ?? [], error: null }) }),
    insert: (rows: unknown) => {
      writes.push(`insert ${table} ${JSON.stringify(rows)}`);
      const result = { data: { id: "action-1" }, error: table === fail ? { message: "denied" } : null };
      return Object.assign(Promise.resolve(result), { select: () => ({ single: async () => result }) });
    },
    delete: () => ({ eq: async (_c: string, id: string) => (writes.push(`delete ${table} ${id}`), { error: null }) }),
  });
  return { from, writes };
}

describe("adding from a notice", () => {
  const page = { images: ["aGk="], text: "" };
  const tables = { settings: [SETTINGS], timetable_slots: SLOTS, deadlines: [] };

  it("writes the action first, then the deadlines, and says what it added", async () => {
    const sb = fakeSupabase(tables);
    const ask = async () => ({ events: [event({})], confidence: 0.9 });
    const done = await addFromNotice({ supabase: sb, pin: "1234", source: "Inbox/notice.jpg", page, subjects: SUBJECTS, today: TODAY, ask });
    expect(done).toEqual({ decision: "added", confidence: 0.9, said: "Added OS FT-II (Thu, 29 Oct).", deadlines: 1 });
    expect(sb.writes[0]).toMatch(/^insert autopilot_actions .*"said":"Added OS FT-II \(Thu, 29 Oct\)\.","confidence":0.9,"deadline_ids":\["[0-9a-f-]{36}"\]/);
    expect(sb.writes[1]).toMatch(/^insert deadlines \[\{.*"source":"Inbox\/notice.jpg"/);
  });

  it("takes the action back when the deadlines can't be added", async () => {
    const sb = fakeSupabase(tables, "deadlines");
    const ask = async () => ({ events: [event({})], confidence: 0.9 });
    await expect(addFromNotice({ supabase: sb, pin: "1234", source: "Inbox/notice.jpg", page, subjects: SUBJECTS, today: TODAY, ask })).rejects.toThrow("Couldn't add the deadlines: denied");
    expect(sb.writes.at(-1)).toBe("delete autopilot_actions action-1");
  });

  it("adds nothing when unsure of the dates, or when it's all there already", async () => {
    const sb = fakeSupabase({ ...tables, deadlines: [{ subject_id: "os", due_date: "2026-10-29T04:30:00.000Z", status: "pending" }] });
    const unsure = async () => ({ events: [event({})], confidence: 0.4 });
    expect(await addFromNotice({ supabase: sb, pin: "1234", source: "Inbox/n.jpg", page, subjects: SUBJECTS, today: TODAY, ask: unsure })).toEqual({ decision: "unsure", confidence: 0.4, said: "Not sure enough of the dates on Inbox/n.jpg (40%); left for you." });
    const sure = async () => ({ events: [event({})], confidence: 0.9 });
    expect(await addFromNotice({ supabase: sb, pin: "1234", source: "Inbox/n.jpg", page, subjects: SUBJECTS, today: TODAY, ask: sure })).toEqual({ decision: "listed", confidence: 0.9, said: "Everything on Inbox/n.jpg is on your list already." });
    expect(sb.writes).toEqual([]);
  });
});
