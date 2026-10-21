import { describe, expect, it } from "vitest";
import { contrast } from "./color";
import { resolve } from "./css";
import tokens from "./tokens.json";

/**
 * Every pair of tokens the app sets one on the other, in every theme and
 * mode, against WCAG AA: text 4.5:1, the accent as a shape (a ring, a
 * focus line, an active tab) 3:1. Runs with the unit tests in CI.
 */
const TEXT = ["ink", "muted", "accent-deep", "good-deep", "warn-deep", "bad-deep"];
const GROUNDS = ["bg", "surface", "surface-2"];

/**
 * Token pairs let off the check, each with the reason. Brutalist's light
 * lime is a fill under ink (the active tab, the ball, a lit chip), never a
 * mark on the page by itself; the ink on it is checked as brand-ink on brand.
 */
const EXCEPTIONS = new Set(["brutalist light: accent on bg", "brutalist light: accent on surface"]);

interface Pair {
  name: string;
  fg: string;
  bg: string;
  min: number;
}

function pairs(): Pair[] {
  const out: Pair[] = [];
  for (const [theme, modes] of Object.entries(tokens.themes))
    for (const mode of ["light", "dark"] as const) {
      const t: Record<string, string> = modes[mode];
      const add = (fg: string, bg: string, min: number) => out.push({ name: `${theme} ${mode}: ${fg} on ${bg}`, fg: resolve(t, fg), bg: resolve(t, bg), min });
      for (const fg of TEXT) for (const bg of GROUNDS) add(fg, bg, 4.5);
      add("brand-ink", "brand", 4.5);
      for (const bg of ["bg", "surface"]) add("accent", bg, 3);
    }
  return out;
}

describe("contrast", () => {
  it("clears WCAG AA for every token pair, in every theme and mode", () => {
    const failing = pairs()
      .filter((p) => !EXCEPTIONS.has(p.name))
      .map((p) => ({ ...p, ratio: contrast(p.fg, p.bg) }))
      .filter((p) => p.ratio < p.min)
      .map((p) => `${p.name} is ${p.ratio.toFixed(2)}:1, needs ${p.min}:1`);
    expect(failing).toEqual([]);
  });

  it("names only exceptions that still fail", () => {
    const named = pairs().filter((p) => EXCEPTIONS.has(p.name));
    expect(named).toHaveLength(EXCEPTIONS.size);
    for (const p of named) expect(contrast(p.fg, p.bg), p.name).toBeLessThan(p.min);
  });

  it("measures as WCAG does", () => {
    expect(contrast("0 0% 0%", "0 0% 100%")).toBeCloseTo(21, 5);
    expect(contrast("0 0% 50%", "0 0% 50%")).toBe(1);
    // #767676 on white is the classic 4.54:1.
    expect(contrast("0 0% 46.3%", "0 0% 100%")).toBeCloseTo(4.54, 1);
  });
});
