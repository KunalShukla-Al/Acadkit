import { describe, expect, it } from "vitest";
import { generateTheme } from "./generate";
import { contrast } from "./color";
import { resolve } from "./css";

/**
 * A generated theme must clear the same WCAG AA gate the hand-made themes do
 * (see contrast.test.ts): text 4.5:1 on every ground, the accent as a shape
 * 3:1, the ink on the brand fill 4.5:1 — in both modes, for any seed.
 */
const TEXT = ["ink", "muted", "accent-deep", "good-deep", "warn-deep", "bad-deep"];
const GROUNDS = ["bg", "surface", "surface-2"];
const SEEDS = [110, 250, 25, 320, 160];

function failures(tokens: Record<string, string>): string[] {
  const out: string[] = [];
  const pair = (fg: string, bg: string, min: number) => {
    const ratio = contrast(resolve(tokens, fg), resolve(tokens, bg));
    if (ratio < min) out.push(`${fg} on ${bg} is ${ratio.toFixed(2)}:1, needs ${min}:1`);
  };
  for (const fg of TEXT) for (const bg of GROUNDS) pair(fg, bg, 4.5);
  for (const bg of ["bg", "surface"]) pair("accent", bg, 3);
  pair("brand-ink", "brand", 4.5);
  return out;
}

describe("generateTheme", () => {
  it("clears WCAG AA for every seed, in light and dark", () => {
    for (const hue of SEEDS) {
      const theme = generateTheme(hue);
      expect(failures(theme.light), `hue ${hue} light`).toEqual([]);
      expect(failures(theme.dark), `hue ${hue} dark`).toEqual([]);
    }
  });

  it("emits every token key the themes use", () => {
    const keys = Object.keys(generateTheme(200).light).sort();
    for (const k of [...TEXT, ...GROUNDS, "accent", "accent-2", "brand", "brand-ink", "line", "radius-card"]) {
      expect(keys).toContain(k);
    }
  });

  it("is deterministic for a seed and varies between seeds", () => {
    expect(generateTheme(210)).toEqual(generateTheme(210));
    expect(generateTheme(210).light.accent).not.toBe(generateTheme(30).light.accent);
  });

  it("normalises the seed hue", () => {
    expect(generateTheme(370)).toEqual(generateTheme(10));
    expect(generateTheme(-20)).toEqual(generateTheme(340));
  });
});
