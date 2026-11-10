import { describe, expect, it } from "vitest";
import { apcaLc, apcaContrast } from "./apca";

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe("apca", () => {
  it("matches the reference anchors for black and white", () => {
    // APCA's canonical values: ~106 dark-on-light, ~-108 light-on-dark.
    expect(apcaLc(BLACK, WHITE)).toBeCloseTo(106, 0);
    expect(apcaLc(WHITE, BLACK)).toBeCloseTo(-108, 0);
  });

  it("carries polarity in the sign", () => {
    expect(apcaLc(BLACK, WHITE)).toBeGreaterThan(0);
    expect(apcaLc(WHITE, BLACK)).toBeLessThan(0);
  });

  it("is zero when text and background match", () => {
    expect(apcaLc([120, 120, 120], [120, 120, 120])).toBe(0);
  });

  it("reports legibility as an absolute number", () => {
    expect(apcaContrast(WHITE, BLACK)).toBeCloseTo(108, 0);
    expect(apcaContrast(BLACK, WHITE)).toBeGreaterThan(90);
  });

  it("falls toward zero as text nears its background", () => {
    const strong = apcaContrast([30, 30, 30], WHITE);
    const weak = apcaContrast([200, 200, 200], WHITE);
    expect(strong).toBeGreaterThan(weak);
  });
});
