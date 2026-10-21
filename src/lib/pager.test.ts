import { describe, expect, it } from "vitest";
import { clampPage, pageUnder, parsePage, screenPage, screenTop, scrubPage } from "@/lib/pager";

describe("pageUnder", () => {
  const pages = [
    { top: 0, bottom: 100 },
    { top: 110, bottom: 210 },
    { top: 220, bottom: 320 },
  ];
  it("names the page spanning the line", () => {
    expect(pageUnder(pages, 50)).toBe(1);
    expect(pageUnder(pages, 150)).toBe(2);
    expect(pageUnder(pages, 320)).toBe(3);
  });
  it("takes the nearest in a gap or past the end", () => {
    expect(pageUnder(pages, 104)).toBe(1);
    expect(pageUnder(pages, 108)).toBe(2);
    expect(pageUnder(pages, 900)).toBe(3);
  });
  it("is 0 with no pages", () => {
    expect(pageUnder([], 10)).toBe(0);
  });
});

describe("screenPage / screenTop", () => {
  it("counts screenfuls, top to bottom", () => {
    expect(screenPage(0, 2500, 1000)).toEqual({ current: 1, total: 3 });
    expect(screenPage(750, 2500, 1000)).toEqual({ current: 2, total: 3 });
    expect(screenPage(1500, 2500, 1000)).toEqual({ current: 3, total: 3 });
  });
  it("is one page when it all fits", () => {
    expect(screenPage(0, 800, 1000)).toEqual({ current: 1, total: 1 });
    expect(screenPage(0, 1000, 1000)).toEqual({ current: 1, total: 1 });
  });
  it("goes back to the screen it counted", () => {
    for (const n of [1, 2, 3]) expect(screenPage(screenTop(n, 3, 2500, 1000), 2500, 1000).current).toBe(n);
    expect(screenTop(9, 3, 2500, 1000)).toBe(1500);
  });
});

describe("scrubPage", () => {
  it("steps a page every 28 px in a short file", () => {
    expect(scrubPage(3, 0, 10, 300)).toBe(3);
    expect(scrubPage(3, 28, 10, 300)).toBe(4);
    expect(scrubPage(3, -60, 10, 300)).toBe(1);
  });
  it("crosses a long file in one swipe", () => {
    expect(scrubPage(1, 300, 200, 300)).toBe(200);
    expect(scrubPage(1, 150, 200, 300)).toBe(101);
  });
  it("stays inside the file", () => {
    expect(scrubPage(5, 10_000, 8, 300)).toBe(8);
    expect(scrubPage(5, -10_000, 8, 300)).toBe(1);
  });
});

describe("parsePage", () => {
  it("reads a number and keeps it in range", () => {
    expect(parsePage(" 12 ", 40)).toBe(12);
    expect(parsePage("99", 40)).toBe(40);
    expect(parsePage("0", 40)).toBe(1);
    expect(parsePage("abc", 40)).toBeNull();
    expect(parsePage("", 40)).toBeNull();
  });
  it("clamps", () => {
    expect(clampPage(2.4, 5)).toBe(2);
    expect(clampPage(3, 0)).toBe(1);
  });
});
