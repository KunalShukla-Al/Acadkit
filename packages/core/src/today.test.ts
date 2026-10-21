import { describe, expect, it } from "vitest";
import { today, type TodayInput } from "./today.ts";
import type { AttendanceRecord, Deadline, Subject, TimetableSlot } from "./types.ts";

const subject = (id: string, code: string, name: string): Subject => ({
  id,
  device_id: "1234",
  code,
  name,
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#000",
});
const OS = subject("os", "21CSC202J", "Operating Systems");
const DSA = subject("dsa", "21CSC201J", "Data Structures and Algorithms");

const slot = (subject_id: string, day_order: number, start: string, end: string, room = "TP301"): TimetableSlot => ({
  id: `${subject_id}-${day_order}-${start}`,
  device_id: "1234",
  subject_id,
  day_order,
  start_time: `${start}:00`,
  end_time: `${end}:00`,
  room,
});

/** `present` of `total` classes of a subject, before the window. */
function history(subject_id: string, present: number, total: number): AttendanceRecord[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `${subject_id}-${i}`,
    device_id: "1234",
    subject_id,
    date: `2026-08-${String(1 + (i % 28)).padStart(2, "0")}`,
    start_time: "08:00:00",
    end_time: "08:50:00",
    status: i < present ? "present" : "absent",
  }));
}

const deadline = (title: string, due: string, extra: Partial<Deadline> = {}): Deadline => ({
  id: title,
  device_id: "1234",
  subject_id: "os",
  title,
  type: "exam",
  due_date: due,
  status: "pending",
  priority: "high",
  ...extra,
});

const base = (date: string, extra: Partial<TodayInput> = {}): TodayInput => ({
  date,
  settings: { sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [] },
  subjects: [OS, DSA],
  slots: [slot("dsa", 3, "10:00", "10:50", "TP402"), slot("os", 3, "08:00", "08:50"), slot("os", 3, "08:50", "09:40"), slot("dsa", 4, "08:00", "08:50")],
  // OS: 40 of 50 (80%, 3 to spare). DSA: 30 of 40 (75%, none).
  attendance: [...history("os", 40, 50), ...history("dsa", 30, 40)],
  snapshots: [],
  deadlines: [],
  ...extra,
});

describe("today", () => {
  // Wednesday 7 Oct 2026 is Day Order 3 (e2e/fixtures.ts).
  it("lists the day's classes in order, with an alarm an hour before the first", () => {
    const t = today(base("2026-10-07"));
    expect(t).toMatchObject({ kind: "working", dayOrder: 3, holiday: null, first: "08:00", last: "10:50", alarm: "07:00", next: null });
    expect(t.classes.map((c) => [c.start, c.short, c.room])).toEqual([
      ["08:00", "OS", "TP301"],
      ["08:50", "OS", "TP301"],
      ["10:00", "DSA", "TP402"],
    ]);
    expect(t.classes[0]).toMatchObject({ attendance: 80, canSkip: 3, mustAttend: false });
    expect(t.classes[2]).toMatchObject({ attendance: 75, canSkip: 0, mustAttend: true });
    expect(t.say).toBe("Day Order 3: 3 classes from 8:00 AM, the first OS in TP301. Don't miss DSA.");
  });

  it("takes the alarm's lead time", () => {
    expect(today(base("2026-10-07", { lead: 45 })).alarm).toBe("07:15");
  });

  it("names a holiday and the next day with classes", () => {
    // Fri 2 Oct is Gandhi Jayanthi; Mon 5 Oct has the next day order.
    const t = today(base("2026-10-02"));
    expect(t).toMatchObject({ kind: "official-holiday", holiday: "Gandhi Jayanthi", classes: [], first: null, alarm: null });
    expect(t.next?.date).toBe("2026-10-05");
    expect(t.say).toBe(`No classes today: Gandhi Jayanthi. Next is Day Order ${t.next!.dayOrder} on Monday.`);
  });

  it("follows a declared holiday's shift of the rotation", () => {
    const plain = today(base("2026-10-08"));
    const shifted = today(base("2026-10-08", { settings: { sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [{ date: "2026-10-07", name: "Rain" }] } }));
    expect(plain.dayOrder).toBe(4);
    expect(shifted.dayOrder).toBe(3);
    expect(today(base("2026-10-07", { settings: { sem_start: "2026-07-21", sem_end: "2026-11-18", declared_holidays: [{ date: "2026-10-07", name: "Rain" }] } })).holiday).toBe("Rain");
  });

  it("brings the week's tests, by the IST day they fall on", () => {
    const t = today(
      base("2026-10-07", {
        deadlines: [
          // 01:00 IST on the 8th is still the 7th in UTC.
          deadline("OS FT-II", "2026-10-07T19:30:00Z"),
          deadline("Lab record", "2026-10-07T10:00:00+05:30", { subject_id: null, type: "lab" }),
          deadline("Done already", "2026-10-09T09:00:00+05:30", { status: "done" }),
          deadline("Too far", "2026-10-15T09:00:00+05:30"),
          deadline("Yesterday", "2026-10-06T09:00:00+05:30"),
        ],
      })
    );
    expect(t.tests.map((x) => [x.title, x.code, x.inDays])).toEqual([
      ["Lab record", null, 0],
      ["OS FT-II", "21CSC202J", 1],
    ]);
    expect(t.say).toMatch(/Lab record is today\.$/);
  });

  it("includes the tests Autopilot added from a notice, saying which notice", () => {
    const t = today(
      base("2026-10-07", {
        deadlines: [
          deadline("FT-II", "2026-10-08T09:00:00+05:30", { source: "Inbox/2026-10/OS FT-II notice.pdf" }),
          deadline("Lab record", "2026-10-09T10:00:00+05:30", { subject_id: null, type: "lab" }),
        ],
      })
    );
    expect(t.tests.map((x) => [x.title, x.type, x.from])).toEqual([
      ["FT-II", "exam", "OS FT-II notice.pdf"],
      ["Lab record", "lab", null],
    ]);
    expect(t.say).toMatch(/FT-II is tomorrow\.$/);
  });

  it("is a quiet day at the weekend and outside the semester", () => {
    expect(today(base("2026-10-10"))).toMatchObject({ kind: "weekend", classes: [], say: expect.stringMatching(/^No classes today\. Next is Day Order \d on Monday\.$/) });
    expect(today(base("2026-12-01"))).toMatchObject({ kind: "post-semester", classes: [], next: null, say: "No classes today." });
  });

  it("from a moment in the day: the class on now or next, and Focus only while classes are ahead", () => {
    const at = (time: string) => today({ ...base("2026-10-07"), time });
    expect(at("07:10")).toMatchObject({ focusUntil: "10:50", arrive: "Day Order 3. Next: OS in TP301 at 8:00 AM. Last class ends at 10:50 AM." });
    expect(at("08:20")).toMatchObject({ focusUntil: "10:50", arrive: "Day Order 3. Now: OS in TP301, until 8:50 AM. Last class ends at 10:50 AM." });
    expect(at("09:45").arrive).toBe("Day Order 3. Next: DSA in TP402 at 10:00 AM. Last class ends at 10:50 AM.");
    expect(at("11:00")).toMatchObject({ focusUntil: null, arrive: "Day Order 3. Classes are over for today." });
    expect(today(base("2026-10-07")).focusUntil).toBeNull();
    expect(today({ ...base("2026-10-02"), time: "09:00" }).arrive).toMatch(/^No classes today: Gandhi Jayanthi\./);
  });
});
