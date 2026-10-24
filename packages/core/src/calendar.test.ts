import { describe, expect, it } from "vitest";
import { buildEffectiveMap, getDayInfo, nextWorkingDate } from "./calendar.ts";

describe("getDayInfo", () => {
  it("resolves a working day's order", () => {
    expect(getDayInfo("2026-07-21").dayOrder).toBe(1);
    expect(getDayInfo("2026-07-24").dayOrder).toBe(4);
  });

  it("flags weekends with no order", () => {
    const d = getDayInfo("2026-07-25");
    expect(d.kind).toBe("weekend");
    expect(d.dayOrder).toBeNull();
  });

  it("flags official holidays with their name", () => {
    const d = getDayInfo("2026-08-26");
    expect(d.kind).toBe("official-holiday");
    expect(d.holidayName).toBe("Milad-un-Nabi");
    expect(d.dayOrder).toBeNull();
  });

  it("flags pre- and post-semester", () => {
    expect(getDayInfo("2026-06-14").kind).toBe("pre-semester");
    expect(getDayInfo("2026-12-01").kind).toBe("post-semester");
  });
});

describe("declared-holiday shifting", () => {
  it("shifts remaining day orders forward onto the next working days", () => {
    const declared = [{ date: "2026-07-22", name: "Strike" }];
    // 07-22 was Day Order 2; with it removed, the sequence slides:
    expect(getDayInfo("2026-07-22", declared).kind).toBe("declared-holiday");
    expect(getDayInfo("2026-07-21", declared).dayOrder).toBe(1);
    expect(getDayInfo("2026-07-23", declared).dayOrder).toBe(2); // was 3
    expect(getDayInfo("2026-07-24", declared).dayOrder).toBe(3); // was 4
    expect(getDayInfo("2026-07-27", declared).dayOrder).toBe(4); // was 5
  });

  it("buildEffectiveMap is identity with no declared holidays", () => {
    const map = buildEffectiveMap([]);
    expect(map["2026-07-21"]).toBe(1);
    expect(map["2026-07-27"]).toBe(5);
  });
});

describe("class days", () => {
  const saturday = { date: "2026-07-25", name: "Working Saturday", day_order: 3 };

  it("gives a weekend its declared day order", () => {
    expect(getDayInfo("2026-07-25", [saturday])).toEqual({
      date: "2026-07-25",
      kind: "working",
      dayOrder: 3,
    });
  });

  it("leaves the rotation around it unchanged", () => {
    expect(getDayInfo("2026-07-24", [saturday]).dayOrder).toBe(4);
    expect(getDayInfo("2026-07-27", [saturday]).dayOrder).toBe(5);
  });

  it("sits in date order in the effective map", () => {
    const dates = Object.keys(buildEffectiveMap([saturday]));
    expect(dates.slice(3, 6)).toEqual(["2026-07-24", "2026-07-25", "2026-07-27"]);
  });

  it("doesn't count as a holiday when holidays shift the rotation", () => {
    const declared = [{ date: "2026-07-22", name: "Strike" }, saturday];
    expect(getDayInfo("2026-07-24", declared).dayOrder).toBe(3);
    expect(getDayInfo("2026-07-25", declared).dayOrder).toBe(3);
    expect(getDayInfo("2026-07-27", declared).dayOrder).toBe(4);
  });

  it("is ignored outside the semester", () => {
    const late = { date: "2026-12-05", name: "Working Saturday", day_order: 1 };
    expect(buildEffectiveMap([late])["2026-12-05"]).toBeUndefined();
    expect(getDayInfo("2026-12-05", [late]).kind).toBe("post-semester");
  });
});

describe("nextWorkingDate", () => {
  it("finds the next date with a day order", () => {
    const n = nextWorkingDate("2026-07-24"); // Fri DO4; next working is Mon 07-27 DO5
    expect(n?.date).toBe("2026-07-27");
    expect(n?.dayOrder).toBe(5);
  });

  it("finds a class Saturday", () => {
    const n = nextWorkingDate("2026-07-24", [{ date: "2026-07-25", name: "", day_order: 3 }]);
    expect(n).toEqual({ date: "2026-07-25", kind: "working", dayOrder: 3 });
  });
});
