import { describe, expect, it } from "vitest";
import { answer, HELP, type AskAccount } from "./answer.ts";
import { parseAsk } from "./ask.ts";
import type { AttendanceRecord, Deadline, Subject } from "./types.ts";

const subject = (id: string, code: string, name: string, short_name: string | null = null): Subject => ({
  id, device_id: "1234", code, name, short_name, credits: 4, type: "theory", faculty: null, color_hex: "#000",
});
const OS = subject("os", "21CSC202J", "Operating Systems", "OS");
const DSA = subject("dsa", "21CSC201J", "Data Structures and Algorithms", "DSA");
const FDS = subject("fds", "21CSS202T", "Fundamentals of Data Science", "FDS");

function history(subject_id: string, present: number, total: number): AttendanceRecord[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `${subject_id}-${i}`, device_id: "1234", subject_id, date: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}`,
    start_time: "08:00:00", end_time: "08:50:00", status: i < present ? "present" : "absent",
  }));
}
const test = (title: string, subject_id: string, due: string, extra: Partial<Deadline> = {}): Deadline => ({
  id: title, device_id: "1234", subject_id, title, type: "exam", due_date: due, status: "pending", priority: "high", ...extra,
});

const account: AskAccount = {
  settings: { id: "s", device_id: "1234", semester: 3, target_sgpa: 8.5, min_attendance: 75, sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [], current_day_order: 1 },
  subjects: [OS, DSA, FDS],
  slots: [
    { id: "a", device_id: "1234", subject_id: "os", day_order: 3, start_time: "08:00:00", end_time: "08:50:00", room: "TP301" },
    { id: "b", device_id: "1234", subject_id: "dsa", day_order: 3, start_time: "10:00:00", end_time: "10:50:00", room: "TP402" },
  ],
  // OS 40/50 (80%, 3 to spare), DSA 30/40 (75%, none), FDS 20/30 (67%, under).
  attendance: [...history("os", 40, 50), ...history("dsa", 30, 40), ...history("fds", 20, 30)],
  snapshots: [],
  deadlines: [
    test("FT-II", "os", "2026-10-29T09:00:00+05:30"),
    test("DSA FJ-III", "dsa", "2026-11-12T00:00:00+05:30"),
    test("Lab record", "os", "2026-10-08T10:00:00+05:30", { type: "lab" }),
  ],
  marks: [],
};
// Wednesday 7 Oct 2026, Day Order 3.
const clock = { date: "2026-10-07", time: "07:30" };
const say = (q: string) => answer(parseAsk(q, account.subjects), account, clock);

describe("answer", () => {
  it("says whether a subject can be skipped, in each state of its attendance, in the screens' words", () => {
    expect(say("can I skip OS")).toBe("Yes. OS has 3 classes to spare: you're at 80%, and the bar is 75%.");
    expect(say("can I bunk DSA")).toBe("Better not. DSA has no classes to spare: you're at 75%, one absence from the bar of 75%.");
    expect(say("should I skip FDS")).toBe("No. You're at 67% in FDS, under the bar of 75%. Attend 10 in a row to get back.");
  });

  it("goes through today's classes when no subject is named", () => {
    expect(say("can I skip today")).toBe("Today: OS, 3 to spare; DSA, none to spare.");
    expect(answer(parseAsk("can i skip today", account.subjects), account, { date: "2026-10-02", time: "08:00" })).toMatch(/^No classes today: Gandhi Jayanthi\./);
  });

  it("names the next test, and the next one in a subject", () => {
    expect(say("when is my next test")).toBe("OS FT-II is on Thursday, 29 October at 9:00 AM, in 22 days.");
    expect(say("next DSA test")).toBe("DSA FJ-III is on Thursday, 12 November, in 36 days.");
    expect(say("next FDS test")).toBe("No FDS test is on your list.");
  });

  it("says when Autopilot added the next test from a notice", () => {
    const withNotice = { ...account, deadlines: account.deadlines.map((d) => (d.title === "FT-II" || d.title === "OS FT-II" ? { ...d, source: "Inbox/2026-10/notice.pdf" } : d)) };
    expect(answer(parseAsk("when is my next test", account.subjects), withNotice, { date: "2026-10-07", time: "08:00" })).toBe(
      "OS FT-II is on Thursday, 29 October at 9:00 AM, in 22 days. Autopilot added it from a notice."
    );
  });

  it("says what a grade needs from here", () => {
    expect(say("what do I need for an A in OS")).toMatch(/^For an A in OS, you need \d+% of what's left/);
    expect(say("what do I need")).toBe("Which subject? Say, for example, what do I need in OS.");
  });

  it("names internals no test has claimed as marks, not as a test", () => {
    expect(say("what do I need for an A in FDS")).toMatch(/, starting with [\d.]+ of the 60 internal marks not announced yet\.$/);
  });

  it("says a test already sat is waiting on its marks, not that it's coming", () => {
    const ft2 = { ...account, deadlines: [test("FT-II", "os", "2026-10-29T09:00:00+05:30", { max_marks: 15 })] };
    const ask = (date: string) => answer(parseAsk("what do I need for an A in OS", account.subjects), ft2, { date, time: "18:00" });
    expect(ask("2026-10-07")).toMatch(/, starting with [\d.]+ of 15 in FT-II on Thursday, 29 October\.$/);
    expect(ask("2026-11-02")).toMatch(/, starting with [\d.]+ of 15 in FT-II, sat on Thursday, 29 October and waiting on its marks\.$/);
  });

  it("says what it can do when it can't place the question", () => {
    expect(say("what's the weather")).toBe(HELP);
  });
});
