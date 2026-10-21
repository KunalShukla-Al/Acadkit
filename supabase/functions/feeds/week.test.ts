/**
 * The feeds with the clock moved through 19-25 October 2026: two official
 * holidays (Ayutha Pooja, Vijaya Dasami), three working days, a weekend.
 * Each day is asked at 5:00 AM IST, when the alarm Shortcut runs, and just
 * either side of midnight IST, where the runtime's UTC clock disagrees.
 */
import { describe, expect, it } from "vitest";
import { handle, type Account } from "./handle.ts";

const TOKEN = "c".repeat(48);
const OS = { id: "os", device_id: "1234", code: "21CSC202J", name: "Operating Systems", credits: 4, type: "theory" as const, faculty: null, color_hex: "#000" };
/** One OS class on every Day Order, starting at 8:00 + day order hours, so the time says the day. */
const slots = [1, 2, 3, 4, 5].map((d) => ({
  id: `s${d}`,
  device_id: "1234",
  subject_id: "os",
  day_order: d,
  start_time: `${String(7 + d).padStart(2, "0")}:00:00`,
  end_time: `${String(7 + d).padStart(2, "0")}:50:00`,
  room: `R${d}`,
}));
const test = { id: "ft2", device_id: "1234", subject_id: "os", title: "OS FT-II", type: "exam" as const, due_date: "2026-10-29T09:00:00+05:30", status: "pending" as const, priority: "high" as const };

function account(declared: { date: string; name: string }[] = []): Account {
  return {
    settings: { id: "s", device_id: "1234", semester: 3, target_sgpa: 8, min_attendance: 75, sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: declared, current_day_order: 1 },
    subjects: [OS],
    slots,
    attendance: [],
    snapshots: [],
    deadlines: [test],
    marks: [],
  };
}

async function at(iso: string, acct = account(), feed = "today") {
  const res = await handle(new Request(`https://x/functions/v1/feeds/${feed}?token=${TOKEN}`), {
    use: async () => ({ pin: "1234", allowed: true }),
    load: async () => acct,
    share: async () => {},
    markAbsent: async () => {},
    now: () => new Date(iso),
  });
  return feed === "today" ? res.json() : res.text();
}

/** 5:00 AM IST on a day, as UTC. */
const fiveAm = (day: string) => new Date(`${day}T05:00:00+05:30`).toISOString();

describe("a week of feeds", () => {
  it("follows the rotation across the holidays and the weekend", async () => {
    const friday = await at(fiveAm("2026-10-16"));
    const d = friday.dayOrder as number;
    const after = (n: number) => ((d - 1 + n) % 5) + 1;

    const week = [];
    for (const day of ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]) week.push(await at(fiveAm(day)));
    expect(week.map((t) => [t.date, t.kind, t.dayOrder, t.holiday])).toEqual([
      ["2026-10-19", "official-holiday", null, "Ayutha Pooja"],
      ["2026-10-20", "official-holiday", null, "Vijaya Dasami"],
      ["2026-10-21", "working", after(1), null],
      ["2026-10-22", "working", after(2), null],
      ["2026-10-23", "working", after(3), null],
      ["2026-10-24", "weekend", null, null],
      ["2026-10-25", "weekend", null, null],
    ]);
    // A day off points at the next day with classes, and its Day Order.
    expect(week[0].next).toEqual({ date: "2026-10-21", dayOrder: after(1) });
    expect(week[5].next).toEqual({ date: "2026-10-26", dayOrder: after(4) });
    // Each working day's one class is at 8:00 + its day order, and the alarm an hour before.
    for (const t of week.filter((x) => x.kind === "working")) {
      expect(t.classes).toHaveLength(1);
      expect(t.first).toBe(`${String(7 + t.dayOrder).padStart(2, "0")}:00`);
      expect(t.alarm).toBe(`${String(6 + t.dayOrder).padStart(2, "0")}:00`);
      expect(t.classes[0].room).toBe(`R${t.dayOrder}`);
    }
    expect(week.filter((x) => x.kind !== "working").every((t) => t.alarm === null && t.classes.length === 0)).toBe(true);
  });

  it("counts down to the test as the week goes on", async () => {
    const inDays = [];
    for (const day of ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]) inDays.push((await at(fiveAm(day))).tests.map((t: { inDays: number }) => t.inDays));
    // 29 Oct is 8 days off on the 21st: outside the week until the 22nd.
    expect(inDays).toEqual([[], [7], [6], [5], [4]]);
  });

  it("turns over at midnight IST, not at midnight UTC", async () => {
    // 23:59 IST on Tuesday 20th and 00:01 IST on Wednesday 21st are both the 20th in UTC.
    expect((await at("2026-10-20T18:29:00Z")).date).toBe("2026-10-20");
    const wednesday = await at("2026-10-20T18:31:00Z");
    expect(wednesday).toMatchObject({ date: "2026-10-21", kind: "working" });
  });

  it("moves the rotation when a holiday is declared mid-week", async () => {
    const plain = await at(fiveAm("2026-10-22"));
    const rain = account([{ date: "2026-10-21", name: "Rain" }]);
    expect(await at(fiveAm("2026-10-21"), rain)).toMatchObject({ kind: "declared-holiday", holiday: "Rain", next: { date: "2026-10-22" } });
    // Wednesday's Day Order moves to Thursday.
    expect((await at(fiveAm("2026-10-22"), rain)).dayOrder).toBe(((plain.dayOrder as number) + 3) % 5 + 1);
  });

  it("keeps the calendar a week back and two months ahead of each day", async () => {
    const days = (ics: string) => [...ics.matchAll(/DTSTART;TZID=Asia\/Kolkata:(\d{8})/g)].map((m) => m[1]);
    const monday = days(await at(fiveAm("2026-10-19"), account(), "calendar.ics"));
    const sunday = days(await at(fiveAm("2026-10-25"), account(), "calendar.ics"));
    expect(monday[0]).toBe("20261012");
    // Sunday's week back starts on the 18th; the first class after it is the 21st.
    expect(sunday[0]).toBe("20261021");
    // Neither holiday has a class; the semester ends on 18 Nov, before the two months are up.
    expect(monday).not.toContain("20261019");
    expect(monday).not.toContain("20261020");
    expect(monday.at(-1)).toBe("20261118");
  });
});
