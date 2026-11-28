import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildIcs, feedEvents, feedPath, fold, icsText, phoneLink } from "./calendar.mjs";

const subjects = new Map([
  ["s-daa", { code: "21CSC204J", short_name: "DAA", name: "Design and Analysis of Algorithms" }],
  ["s-ai", { code: "21CSC206T", short_name: "AI", name: "Artificial Intelligence" }],
]);

describe("the feed's events", () => {
  const deadlines = [
    { id: "d1", subject_id: "s-daa", title: "FT-I", type: "exam", due_date: "2027-01-27T04:00:00Z", status: "pending", source: null },
    { id: "d2", subject_id: "s-ai", title: "Worksheet 1", type: "assignment", due_date: "2027-01-20T12:30:00Z", status: "done", source: "Classroom" },
  ];
  const suggestions = [
    { subject_code: "21CSC204J", label: "FT-I", due_date: "2027-01-27T09:30:00+05:30", source: "WhatsApp · AS1 OFFICIAL · faculty · 20 Nov", evidence: "DAA FT-I on 27 Jan" },
    { subject_code: "21CSC206T", label: "CT-I", due_date: "2027-02-02T09:00:00+05:30", source: "WhatsApp · AS1 OFFICIAL · a circular · 21 Nov", evidence: "AI CT 1 on 2 Feb" },
  ];

  it("lists confirmed deadlines, then suggestions that match none, in time order", () => {
    const events = feedEvents({ deadlines, subjects, suggestions });
    expect(events.map((e) => e.summary)).toEqual(["✓ AI Worksheet 1", "DAA FT-I", "? AI CT-I (not confirmed)"]);
    expect(events[2].uid).toBe("suggested-21CSC206T-CT-I-2027-02-02@persona");
    expect(events[2].description).toContain("“AI CT 1 on 2 Feb”");
  });
});

describe("the .ics", () => {
  const ics = buildIcs(
    [{ uid: "deadline-d1@acadkit", start: "2027-01-27T04:00:00Z", summary: "DAA FT-I", description: "exam · from the CR, Units 1; 2" }],
    new Date("2026-11-28T05:00:00Z")
  );

  it("is a calendar with an event, a day-before alert and CRLF lines", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20270127T040000Z");
    expect(ics).toContain("DTSTAMP:20261128T050000Z");
    expect(ics).toContain("TRIGGER:-P1D");
    expect(ics).toContain("DESCRIPTION:exam · from the CR\\, Units 1\\; 2");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes text and folds long lines without splitting a character", () => {
    expect(icsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const long = `SUMMARY:${"é".repeat(60)}`;
    const folded = fold(long);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });
});

describe("the subscription", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "persona-cal-"));
    file = path.join(dir, "calendar.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps one secret path and signs one link each for the calendar and the widget", async () => {
    const where = await feedPath("1234", file);
    expect(where).toMatch(/^1234\/calendar\/[0-9a-f]{24}\.ics$/);
    expect(await feedPath("1234", file)).toBe(where);
    const createSignedUrl = vi.fn(async (p: string) => ({ data: { signedUrl: `https://x.supabase.co/storage/v1/object/sign/study-files/${p}?token=t` }, error: null }));
    const supabase = { storage: { from: () => ({ createSignedUrl }) } };
    const link = await phoneLink({ supabase, pin: "1234", file });
    expect(link).toBe(`webcal://x.supabase.co/storage/v1/object/sign/study-files/${where}?token=t`);
    expect(await phoneLink({ supabase, pin: "1234", file })).toBe(link);
    expect(createSignedUrl).toHaveBeenCalledOnce();
    expect(createSignedUrl.mock.calls[0][1]).toBe(5 * 365 * 86_400);
    const widget = await phoneLink({ supabase, pin: "1234", file, what: "widget" });
    expect(widget).toBe(`https://x.supabase.co/storage/v1/object/sign/study-files/${where.replace(".ics", "-today.json")}?token=t`);
    expect(await phoneLink({ supabase, pin: "1234", file })).toBe(link);
    expect(createSignedUrl).toHaveBeenCalledTimes(2);
  });
});
