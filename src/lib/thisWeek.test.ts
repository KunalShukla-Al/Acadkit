import { describe, expect, it } from "vitest";
import type { Deadline } from "@acadkit/core/types";
import type { PrepTest } from "@/lib/examPrep";
import { activeNotices, daysAway, noticeKey, orderedTodos, weekAhead, type Notice } from "@/lib/thisWeek";

// Sat 10 Oct 2026, 10:00 IST. Every time here is far enough from midnight to land on the same day in IST and in UTC (CI).
const NOW = new Date("2026-10-10T10:00:00+05:30").getTime();

const deadline = (over: Partial<Deadline>): Deadline => ({
  id: "d1",
  device_id: "1234",
  subject_id: "fds",
  title: "FT-III",
  type: "exam",
  due_date: "2026-10-15T09:30:00+05:30",
  status: "pending",
  priority: "medium",
  ...over,
});
const test = (over: Partial<PrepTest>): PrepTest => ({
  subject_code: "21CSS202T",
  label: "FT-III",
  due_date: "2026-10-15T08:00:00+05:30",
  title: "FDS FT-III",
  topics: [],
  files: [],
  ...over,
});
const subjects = [
  { id: "fds", code: "21CSS202T" },
  { id: "dsa", code: "21CSC201J" },
];

describe("weekAhead", () => {
  it("joins a deadline and its prep on the same subject and day", () => {
    const items = weekAhead([deadline({})], [test({})], subjects, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "d1", subject_code: "21CSS202T", prep: { title: "FDS FT-III" } });
  });

  it("keeps prep with no deadline, and a deadline with no prep, soonest first", () => {
    const items = weekAhead([deadline({ id: "a", subject_id: "dsa", due_date: "2026-10-12T14:00:00+05:30" })], [test({})], subjects, NOW);
    expect(items.map((i) => [i.deadline?.id ?? null, i.prep?.title ?? null])).toEqual([
      ["a", null],
      [null, "FDS FT-III"],
    ]);
  });

  it("leaves out what is done, past, or more than seven days ahead", () => {
    const items = weekAhead(
      [
        deadline({ id: "done", status: "done" }),
        deadline({ id: "past", due_date: "2026-10-09T12:00:00+05:30" }),
        deadline({ id: "far", due_date: "2026-10-18T12:00:00+05:30" }),
        deadline({ id: "edge", due_date: "2026-10-17T20:00:00+05:30" }),
      ],
      [test({ due_date: "2026-10-29T08:00:00+05:30" })],
      subjects,
      NOW
    );
    expect(items.map((i) => i.key)).toEqual(["edge"]);
  });

  it("doesn't match a test on another day", () => {
    const items = weekAhead([deadline({ due_date: "2026-10-14T12:00:00+05:30" })], [test({})], subjects, NOW);
    expect(items).toHaveLength(2);
    expect(items[0].prep).toBeNull();
  });
});

describe("activeNotices", () => {
  const n = (over: Partial<Notice>): Notice => ({ subject_code: null, text: "x", source: null, posted: null, until: "2026-10-12", file: null, ...over });
  it("drops notices past their end date and puts the newest first", () => {
    const notices = [n({ text: "old", posted: "2026-10-01" }), n({ text: "gone", until: "2026-10-09" }), n({ text: "new", posted: "2026-10-09" }), n({ text: "today", until: "2026-10-10" })];
    expect(activeNotices({ version: 1, generatedAt: 0, notices }, NOW).map((x) => x.text)).toEqual(["new", "old", "today"]);
  });
  it("is empty before the scan has written any", () => {
    expect(activeNotices(null, NOW)).toEqual([]);
  });
  it("leaves out notices swiped away, until they're reworded", () => {
    const gone = n({ text: "exam cancelled", posted: "2026-10-10" });
    const notices = [gone, n({ text: "kept" })];
    const hidden = { [noticeKey(gone)]: gone.until };
    expect(activeNotices({ version: 1, generatedAt: 0, notices }, NOW, hidden).map((x) => x.text)).toEqual(["kept"]);
    const reworded = { ...gone, text: "exam cancelled, new date Fri" };
    expect(activeNotices({ version: 1, generatedAt: 0, notices: [reworded] }, NOW, hidden)).toHaveLength(1);
  });
});

describe("daysAway", () => {
  it("counts calendar days", () => {
    expect(daysAway("2026-10-10T23:00:00+05:30", NOW)).toBe("today");
    expect(daysAway("2026-10-11T08:00:00+05:30", NOW)).toBe("tomorrow");
    expect(daysAway("2026-10-15T08:00:00+05:30", NOW)).toBe("in 5 days");
  });
});

describe("orderedTodos", () => {
  it("puts dated to-dos first, soonest first, then the rest in their order", () => {
    const list = orderedTodos([
      { text: "a", project: null, due: null },
      { text: "b", project: null, due: "2026-10-21" },
      { text: "c", project: null, due: null },
      { text: "d", project: null, due: "2026-10-16" },
    ]);
    expect(list.map((t) => t.text)).toEqual(["d", "b", "a", "c"]);
  });
});
