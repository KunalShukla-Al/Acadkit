import { describe, expect, it } from "vitest";
import { attendanceHabits, classObservations, markHabits, markKind, markObservations } from "./habits.ts";
import type { AttendanceRecord, Mark, SemesterArchive, Subject, TimetableSlot } from "./types.ts";

const mark = (subject_id: string, component_type: Mark["component_type"], got: number, max: number) =>
  ({ subject_id, component_type, marks_obtained: got, max_marks: max, is_external: false, label: "" }) as Mark;

describe("markKind", () => {
  it("sets the small ones apart", () => {
    expect(markKind("Assignment", 5)).toBe("Assignment:quick");
    expect(markKind("CT", 25)).toBe("CT");
    expect(markKind("External", 3)).toBe("External");
  });
});

describe("markHabits", () => {
  it("finds the kinds you do better on than your usual in the same subject", () => {
    const subjects = [{ id: "os" }, { id: "dsa" }] as Subject[];
    const marks = [
      // Assignments near full, CTs well under, in both subjects.
      mark("os", "Assignment", 5, 5), mark("os", "Assignment", 4.5, 5), mark("os", "CT", 30, 50), mark("os", "CT", 32, 50),
      mark("dsa", "Assignment", 5, 5), mark("dsa", "CT", 33, 50),
      mark("gone", "CT", 1, 50), // not a subject this term: ignored
    ];
    const { kinds, offsets } = markHabits(markObservations([], marks, subjects));
    expect(kinds.map((k) => k.kind)).toEqual(["Assignment:quick", "CT"]);
    expect(offsets.get("Assignment:quick")).toBeGreaterThan(0.3);
    expect(offsets.get("CT")).toBeLessThan(-0.3);
    expect(kinds[0]).toMatchObject({ label: "5-mark assignments", n: 3 });
    expect(Math.round(kinds[1].pct)).toBe(63);
  });

  it("learns from archived semesters too, and not from a subject with one mark", () => {
    const archived = {
      id: "a1",
      summary: [
        { code: "21MAB101T", marks: { items: [{ type: "CT", got: 10, max: 20 }, { type: "Assignment", got: 10, max: 10 }] } },
        { code: "21LEM101T", marks: { items: [{ type: "CT", got: 2, max: 20 }] } },
      ],
    } as unknown as SemesterArchive;
    const obs = markObservations([archived], [], []);
    expect(obs).toHaveLength(3);
    const { offsets } = markHabits(obs);
    // One CT and one assignment from the maths subject: too little for either (fewer than 2 each).
    expect(offsets.size).toBe(0);
  });

  it("pulls a lucky streak toward no difference", () => {
    const subjects = [{ id: "s" }] as Subject[];
    const two = markHabits(markObservations([], [mark("s", "Lab", 10, 10), mark("s", "Lab", 10, 10), mark("s", "CT", 15, 25), mark("s", "CT", 15, 25)], subjects));
    const many = markHabits(
      markObservations([], [...Array(10)].flatMap(() => [mark("s", "Lab", 10, 10), mark("s", "CT", 15, 25)]), subjects)
    );
    expect(Math.abs(many.offsets.get("Lab")!)).toBeGreaterThan(Math.abs(two.offsets.get("Lab")!));
  });
});

describe("attendanceHabits", () => {
  const subjects = [
    { id: "os", type: "theory" },
    { id: "osl", type: "lab" },
  ] as Subject[];
  const timetable = [{ subject_id: "osl", day_order: 2, start_time: "14:00:00", slot_type: "lab" }] as TimetableSlot[];
  const rec = (subject_id: string, date: string, start: string, status: AttendanceRecord["status"], auto = false) =>
    ({ subject_id, date, start_time: start, end_time: start, status, auto_marked: auto }) as AttendanceRecord;

  it("says which classes you miss more than your usual", () => {
    const records: AttendanceRecord[] = [];
    // 20 theory classes at 10, one missed; 20 labs at 2 PM, eight missed.
    for (let i = 0; i < 20; i++) records.push(rec("os", `2026-08-${String(i + 1).padStart(2, "0")}`, "10:00:00", i === 0 ? "absent" : "present"));
    for (let i = 0; i < 20; i++) records.push(rec("osl", `2026-09-${String(i + 1).padStart(2, "0")}`, "14:00:00", i < 8 ? "absent" : "present"));
    records.push(rec("os", "2026-10-01", "10:00:00", "present", true)); // auto-marked: not counted
    records.push(rec("os", "2026-10-02", "10:00:00", "holiday")); // not a class
    const dayOrders = Object.fromEntries([...Array(20)].map((_, i) => [`2026-09-${String(i + 1).padStart(2, "0")}`, 2]));
    const obs = classObservations([], records, subjects, timetable, dayOrders);
    expect(obs).toHaveLength(40);
    const { usual, habits } = attendanceHabits(obs);
    expect(usual).toBeCloseTo(9 / 40);
    const labs = habits.find((h) => h.key === "session:lab")!;
    const theory = habits.find((h) => h.key === "session:theory")!;
    expect(labs.ratio).toBeGreaterThan(1.3);
    expect(theory.ratio).toBeLessThan(0.75);
    expect(habits.find((h) => h.key === "time:afternoon")!.label).toBe("Afternoon classes (2 PM on)");
    expect(habits.find((h) => h.key === "dayorder:2")).toBeDefined();
  });

  it("reads archived classes, old format and new", () => {
    const archived = {
      id: "a",
      summary: [
        { code: "X", marks: { subjectType: "lab" }, attendance: { classes: [["2026-03-02", "08:00", "absent"]] } },
        { code: "Y", attendance: { classes: [["2026-03-03", "08:00", "09:40", "present", 3, "theory", 0], ["2026-03-04", "08:00", "09:40", "present", 4, "theory", 1]] } },
      ],
    } as unknown as SemesterArchive;
    const obs = classObservations([archived], [], [], [], {});
    expect(obs).toEqual([
      { missed: true, session: "lab", hour: 8, weekday: 1, dayOrder: null },
      { missed: false, session: "theory", hour: 8, weekday: 2, dayOrder: 3 },
    ]);
  });
});
