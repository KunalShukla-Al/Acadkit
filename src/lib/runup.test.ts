import { describe, expect, it } from "vitest";
import {
  clampDay,
  dayProgress,
  eventProgress,
  eventsOn,
  eventTasks,
  formatMinutes,
  itemsFor,
  materialsFor,
  monthGrid,
  openingDay,
  parseDay,
  phase,
  planMonths,
  pyqGroups,
  pyqUnits,
  relativeDay,
  stepDay,
  topicCounts,
  totalMinutes,
  undatedEvents,
  upcomingEvents,
  assemble,
  fromV1,
  type RunupData,
  type RunupEvent,
  type RunupIndex,
  type RunupPyq,
  type RunupTask,
} from "@/lib/runup";
import type { StudyFile } from "@/lib/studyFiles";

const task = (id: string, extra: Partial<RunupTask> = {}): RunupTask => ({
  id,
  text: `Task ${id}`,
  subject_code: null,
  event: null,
  minutes: null,
  files: [],
  ...extra,
});

const event = (id: string, date: string | null, extra: Partial<RunupEvent> = {}): RunupEvent => ({
  id,
  subject_code: "21CSC202J",
  title: id.toUpperCase(),
  kind: "test",
  date,
  when: null,
  target: { score: 12, max: 15, note: null },
  weight: null,
  format: null,
  units: [2, 3],
  portion: [],
  scoring: [],
  prepare: [],
  analysis: null,
  pyqCount: 0,
  pyqsFile: null,
  files: [],
  ...extra,
});

const plan: RunupData = {
  generatedAt: 0,
  title: "Run-up",
  start: "2026-10-12",
  end: "2026-11-30",
  events: [event("ft2", "2026-10-14"), event("endsem", "2026-11-30"), event("ct2", null)],
  days: [
    { date: "2026-10-12", focus: null, tasks: [task("a", { event: "ft2", minutes: 60 }), task("b", { event: "endsem", minutes: 30 }), task("c")] },
    { date: "2026-10-13", focus: null, tasks: [task("d", { event: "ct2" })] },
    { date: "2026-10-15", focus: null, tasks: [task("e")] },
  ],
};

describe("dates", () => {
  it("accepts only real calendar days", () => {
    expect(parseDay("2026-10-15")).toBe("2026-10-15");
    expect(parseDay("2026-11-31")).toBeNull();
    expect(parseDay("2026-02-29")).toBeNull();
    expect(parseDay("15-10-2026")).toBeNull();
    expect(parseDay(undefined)).toBeNull();
  });

  it("places a date against the window and pulls it inside", () => {
    expect(phase(plan, "2026-10-01")).toBe("before");
    expect(phase(plan, "2026-10-12")).toBe("during");
    expect(phase(plan, "2026-11-30")).toBe("during");
    expect(phase(plan, "2026-12-01")).toBe("after");
    expect(clampDay(plan, "2026-10-01")).toBe("2026-10-12");
    expect(clampDay(plan, "2027-01-01")).toBe("2026-11-30");
    expect(openingDay(plan, "2026-10-20")).toBe("2026-10-20");
  });

  it("steps a day at a time without leaving the window, across month ends", () => {
    expect(stepDay(plan, "2026-10-31", 1)).toBe("2026-11-01");
    expect(stepDay(plan, "2026-10-12", -1)).toBe("2026-10-12");
    expect(stepDay(plan, "2026-11-30", 1)).toBe("2026-11-30");
  });

  it("says how far away a day is", () => {
    expect(relativeDay("2026-10-12", "2026-10-12")).toBe("today");
    expect(relativeDay("2026-10-12", "2026-10-13")).toBe("tomorrow");
    expect(relativeDay("2026-10-12", "2026-10-11")).toBe("yesterday");
    expect(relativeDay("2026-10-12", "2026-10-29")).toBe("in 17 days");
    expect(relativeDay("2026-10-12", "2026-10-09")).toBe("3 days ago");
  });
});

describe("a day's list", () => {
  it("shows a future or past day's own plan with its ticks, never carried work", () => {
    const { planned, carried } = itemsFor(plan, "2026-10-12", new Set(["a"]), "2026-10-15");
    expect(planned.map((i) => [i.task.id, i.done])).toEqual([
      ["a", true],
      ["b", false],
      ["c", false],
    ]);
    expect(carried).toEqual([]);
  });

  it("carries every unticked earlier task to today, with the day it came from", () => {
    const { planned, carried } = itemsFor(plan, "2026-10-13", new Set(["c"]), "2026-10-13");
    expect(planned.map((i) => i.task.id)).toEqual(["d"]);
    expect(carried.map((i) => [i.task.id, i.from])).toEqual([
      ["a", "2026-10-12"],
      ["b", "2026-10-12"],
    ]);
  });

  it("stops carrying a task once its test has happened, but not an undated one", () => {
    const { carried } = itemsFor(plan, "2026-10-15", new Set(), "2026-10-15");
    // "a" was for ft2 on the 14th: gone. "b" is for the end-sem: still on. "d" has no date yet: still on.
    expect(carried.map((i) => i.task.id)).toEqual(["b", "c", "d"]);
  });

  it("carries on the day of the test itself", () => {
    const { carried } = itemsFor(plan, "2026-10-14", new Set(), "2026-10-14");
    expect(carried.map((i) => i.task.id)).toContain("a");
  });

  it("handles a day with no plan", () => {
    expect(itemsFor(plan, "2026-10-14", new Set(), "2026-10-20")).toEqual({ planned: [], carried: [] });
  });

  it("counts progress on the day each task was planned for", () => {
    expect(dayProgress(plan, "2026-10-12", new Set(["a", "c"]))).toEqual({ done: 2, total: 3 });
    expect(dayProgress(plan, "2026-10-14", new Set())).toEqual({ done: 0, total: 0 });
  });

  it("totals minutes and writes them out", () => {
    const { planned } = itemsFor(plan, "2026-10-12", new Set(), "2026-10-20");
    expect(totalMinutes(planned)).toBe(90);
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(0)).toBe("");
  });
});

describe("events", () => {
  it("finds a day's events, the ones coming up, and the undated ones", () => {
    expect(eventsOn(plan, "2026-10-14").map((e) => e.id)).toEqual(["ft2"]);
    expect(upcomingEvents(plan, "2026-10-15").map((e) => e.id)).toEqual(["endsem"]);
    expect(upcomingEvents(plan, "2026-10-01", 1).map((e) => e.id)).toEqual(["ft2"]);
    expect(undatedEvents(plan).map((e) => e.id)).toEqual(["ct2"]);
  });

  it("tracks the tasks that prepare for an event", () => {
    expect(eventProgress(plan, "ft2", new Set(["a"]))).toEqual({ done: 1, total: 1 });
    expect(eventProgress(plan, "nothing", new Set())).toEqual({ done: 0, total: 0 });
    expect(eventTasks(plan, "endsem", new Set()).map((i) => [i.task.id, i.from])).toEqual([["b", "2026-10-12"]]);
  });
});

describe("materials", () => {
  const file = (path: string, extra: Partial<StudyFile> = {}): StudyFile => ({ path, size: 1, mtime: 0, key: path, ...extra });
  const files = [
    file("OS/Unit3.pptx", { subject_code: "21CSC202J", unit: 3, kind: "notes" }),
    file("OS/Unit2.pdf", { subject_code: "21CSC202J", unit: 2, kind: "notes" }),
    file("OS/Unit1.pdf", { subject_code: "21CSC202J", unit: 1, kind: "notes" }),
    file("OS/pyq.pdf", { subject_code: "21CSC202J", unit: 2, kind: "pyq" }),
    file("OS/guide.pdf", { subject_code: "21CSC202J", unit: 2, kind: "guide" }),
    file("DSA/Unit2.pdf", { subject_code: "21CSC201J", unit: 2, kind: "notes" }),
    file("OS/picked.pdf", { subject_code: "21CSC202J", kind: "pyq" }),
  ];

  it("puts picked files first, then the subject's notes for the event's units, past papers left out", () => {
    const ev = event("ft2", "2026-10-29", { files: [{ path: "OS/picked.pdf", why: "last year" }, { path: "gone.pdf", why: null }] });
    const out = materialsFor(ev, files);
    expect(out.map((m) => [m.file.path, m.picked])).toEqual([
      ["OS/picked.pdf", true],
      ["OS/guide.pdf", false],
      ["OS/Unit2.pdf", false],
      ["OS/Unit3.pptx", false],
    ]);
    expect(out[0].why).toBe("last year");
  });

  it("finds nothing extra for an event without a subject or units", () => {
    expect(materialsFor(event("x", null, { subject_code: null }), files)).toEqual([]);
    expect(materialsFor(event("x", null, { units: [] }), files)).toEqual([]);
  });
});

describe("past papers", () => {
  const pyqs: RunupPyq[] = [
    { source: "FJ2 2025 · Set B", file: "a.jpg", page: 1, number: "6a", marks: 10, unit: 2, topic: "Threads", year: 2025, kind: "ct", text: "Thread models" },
    { source: "End-sem May 2025", file: "b.pdf", page: 2, number: "23", marks: 8, unit: 3, topic: "Deadlock", year: 2025, kind: "end_sem", text: "Banker's" },
    { source: "FJ2 2025 · Set B", file: "a.jpg", page: 1, number: "7b", marks: 10, unit: 2, topic: "Threads", year: 2025, kind: "ct", text: "TestAndSet" },
    { source: null, file: null, page: null, number: null, marks: null, unit: null, topic: null, year: null, kind: null, text: "Loose" },
  ];

  it("groups questions by paper in order, and filters to a unit", () => {
    expect(pyqGroups(pyqs).map((g) => [g.source, g.questions.length])).toEqual([
      ["FJ2 2025 · Set B", 2],
      ["End-sem May 2025", 1],
      ["Past papers", 1],
    ]);
    expect(pyqGroups(pyqs, 3).map((g) => g.source)).toEqual(["End-sem May 2025"]);
    expect(pyqUnits(pyqs)).toEqual([2, 3]);
  });

  it("counts topics, most asked first", () => {
    expect(topicCounts(pyqs)).toEqual([
      { topic: "Threads", count: 2 },
      { topic: "Deadlock", count: 1 },
    ]);
  });
});

describe("split files", () => {
  const index: RunupIndex = {
    version: 2,
    generatedAt: 0,
    title: "Run-up",
    start: "2026-10-12",
    end: "2026-11-30",
    events: [event("ft2", "2026-10-14", { pyqCount: 3, pyqsFile: "runup/pyqs-ft2-abc.json" })],
    months: ["runup/2026-11-def.json", "runup/2026-10-abc.json"],
  };

  it("puts the months back together, days in order", () => {
    const out = assemble(index, [{ days: [{ date: "2026-11-01", focus: null, tasks: [] }] }, { days: [{ date: "2026-10-12", focus: null, tasks: [task("a")] }] }]);
    expect(out.days.map((d) => d.date)).toEqual(["2026-10-12", "2026-11-01"]);
    expect(out.events[0].pyqsFile).toBe("runup/pyqs-ft2-abc.json");
    expect(out).not.toHaveProperty("months");
  });

  it("reads a plan from before the split, its questions inline", () => {
    const q: RunupPyq = { source: null, file: null, page: null, number: null, marks: null, unit: null, topic: null, year: null, kind: null, text: "Loose" };
    const out = fromV1({ version: 1, generatedAt: 0, title: null, start: "2026-10-12", end: "2026-11-30", events: [{ ...event("ft2", "2026-10-14"), pyqs: [q, q] }], days: [] });
    expect(out.events[0]).toMatchObject({ pyqCount: 2, pyqsFile: null, pyqs: [q, q] });
  });
});

describe("calendar", () => {
  it("lays a month out Monday first, padded to whole weeks", () => {
    const oct = monthGrid(2026, 9);
    // 1 Oct 2026 is a Thursday.
    expect(oct[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(oct.flat().filter(Boolean)).toHaveLength(31);
    expect(oct.every((w) => w.length === 7)).toBe(true);
  });

  it("lists the months a plan spans", () => {
    expect(planMonths(plan)).toEqual([
      [2026, 9],
      [2026, 10],
    ]);
    expect(planMonths({ start: "2026-12-20", end: "2027-01-05" })).toEqual([
      [2026, 11],
      [2027, 0],
    ]);
  });
});
