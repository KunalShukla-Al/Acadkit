import { describe, expect, it } from "vitest";
import { MAX_CANVAS_PIXELS, quickRatio, sharpRatio } from "./render-scale";

describe("sharpRatio", () => {
  it("follows the display's density", () => {
    expect(sharpRatio(2, 800, 1.414)).toBe(2);
    expect(sharpRatio(1, 800, 1.414)).toBe(1);
  });

  it("never goes past 3×", () => {
    expect(sharpRatio(4, 300, 1.414)).toBe(3);
  });

  it("keeps a wide page's canvas under the pixel cap", () => {
    const width = 2000;
    const aspect = 1.414;
    const r = sharpRatio(3, width, aspect);
    expect(r).toBeLessThan(3);
    expect(width * r * (width * aspect * r)).toBeCloseTo(MAX_CANVAS_PIXELS, -3);
  });

  it("treats an unknown density as 1×", () => {
    expect(sharpRatio(0, 800, 1.414)).toBe(1);
  });
});

describe("quickRatio", () => {
  it("draws a 1× pass first on a dense screen", () => {
    expect(quickRatio(2)).toBe(1);
    expect(quickRatio(3)).toBe(1);
  });

  it("skips it when the sharp pass is about as cheap", () => {
    expect(quickRatio(1)).toBeNull();
    expect(quickRatio(1.25)).toBeNull();
    // A huge page capped near 1.2×: one pass is enough.
    expect(quickRatio(sharpRatio(3, 2000, 1.414))).toBeNull();
  });
});
