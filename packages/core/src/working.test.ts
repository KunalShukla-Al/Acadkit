import { describe, expect, it } from "vitest";
import { count, day, pct } from "./working.ts";

describe("working's words", () => {
  it("shows percentages and counts as the app does", () => {
    expect([pct(84), pct(66.666), pct(74.96)]).toEqual(["84.0%", "66.7%", "75.0%"]);
    expect([count(1, "class", "classes"), count(3, "class", "classes"), count(2, "day")]).toEqual(["1 class", "3 classes", "2 days"]);
    expect([day("2026-09-30"), day("2026-11-03")]).toEqual(["30 Sep", "3 Nov"]);
  });
});
