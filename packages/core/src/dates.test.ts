import { describe, expect, it } from "vitest";
import { addDays, diffDays, istParts, isWeekend, parseISODate, relativeDay, stillAhead, toISODate } from "./dates.ts";

describe("dates", () => {
  it("formats a Date to local ISO", () => {
    expect(toISODate(new Date(2026, 6, 21))).toBe("2026-07-21");
  });

  it("round-trips parse/format", () => {
    expect(toISODate(parseISODate("2026-11-18"))).toBe("2026-11-18");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-07-21", -1)).toBe("2026-07-20");
  });

  it("detects weekends", () => {
    expect(isWeekend("2026-07-25")).toBe(true); // Saturday
    expect(isWeekend("2026-07-26")).toBe(true); // Sunday
    expect(isWeekend("2026-07-21")).toBe(false); // Tuesday
  });

  it("diffs days", () => {
    expect(diffDays("2026-07-21", "2026-07-28")).toBe(7);
    expect(diffDays("2026-07-28", "2026-07-21")).toBe(-7);
  });
});

describe("relativeDay", () => {
  const from = new Date("2026-09-10T12:00:00");

  it("names the recent past rather than making you subtract", () => {
    expect(relativeDay("2026-09-10", from)).toBe("today");
    expect(relativeDay("2026-09-09", from)).toBe("yesterday");
    expect(relativeDay("2026-09-07", from)).toBe("3 days ago");
  });

  it("falls back to the date once counting stops helping", () => {
    // "37 days ago" is harder to place than the date itself.
    expect(relativeDay("2026-08-04", from)).toMatch(/^on /);
  });

  it("treats a future date as today rather than showing a negative", () => {
    expect(relativeDay("2026-09-12", from)).toBe("today");
  });
});

describe("stillAhead", () => {
  const paper = "2026-11-25T14:00:00+05:30";

  it("reads a timestamp in IST, whatever zone it was written in", () => {
    expect(istParts("2026-11-25T08:30:00Z")).toEqual({ date: "2026-11-25", time: "14:00" });
    expect(istParts("2026-11-24T18:30:00Z")).toEqual({ date: "2026-11-25", time: "00:00" });
  });

  it("holds a test until it starts, and all day without a time to compare", () => {
    expect([stillAhead(paper, "2026-11-24"), stillAhead(paper, "2026-11-26")]).toEqual([true, false]);
    expect([stillAhead(paper, "2026-11-25", "13:59"), stillAhead(paper, "2026-11-25", "14:00")]).toEqual([true, false]);
    expect(stillAhead(paper, "2026-11-25")).toBe(true);
  });

  it("keeps one set at midnight for its whole day", () => {
    expect(stillAhead("2026-11-25T00:00:00+05:30", "2026-11-25", "23:00")).toBe(true);
  });
});
