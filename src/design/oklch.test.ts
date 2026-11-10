import { describe, expect, it } from "vitest";
import { oklchToRgb, oklchToHsl, rgbToHsl, rgbToOklch, type RGB } from "./oklch";

describe("oklch", () => {
  it("pins the achromatic ends", () => {
    expect(oklchToRgb(1, 0, 0)).toEqual([255, 255, 255]);
    expect(oklchToRgb(0, 0, 0)).toEqual([0, 0, 0]);
  });

  it("round-trips sRGB through OKLCH", () => {
    const samples: RGB[] = [
      [255, 255, 255],
      [0, 0, 0],
      [18, 52, 120],
      [214, 92, 40],
      [60, 160, 110],
    ];
    for (const rgb of samples) {
      const { L, C, H } = rgbToOklch(rgb);
      const back = oklchToRgb(L, C, H);
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i] - rgb[i])).toBeLessThanOrEqual(1);
    }
  });

  it("writes the token triplet format", () => {
    expect(rgbToHsl([255, 0, 0])).toBe("0 100% 50%");
    expect(rgbToHsl([255, 255, 255])).toBe("0 0% 100%");
    expect(rgbToHsl([0, 0, 0])).toBe("0 0% 0%");
  });

  it("steps lightness monotonically at a fixed hue and chroma", () => {
    const light = rgbToOklch(oklchToRgb(0.85, 0.05, 250)).L;
    const dark = rgbToOklch(oklchToRgb(0.35, 0.05, 250)).L;
    expect(light).toBeGreaterThan(dark);
  });

  it("emits a parseable triplet from OKLCH", () => {
    expect(oklchToHsl(0.7, 0.15, 250)).toMatch(/^[\d.]+ [\d.]+% [\d.]+%$/);
  });
});
