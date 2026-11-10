/**
 * Seed → system: one hue in, a whole theme out — bg/surface/ink/accent and
 * the semantic deeps, for light and dark, as the HSL triplets tokens.json
 * holds. OKLCH (oklch.ts) places each step on an even lightness track; the
 * WCAG gate (color.ts) every text/ground pair must clear is enforced by
 * search; APCA (apca.ts) picks the legible ink on a fill. The output drops
 * straight into tokens.json and is checked by the same contrast test the
 * hand-made themes are.
 */

import { contrast, hslToRgb } from "./color";
import { oklchToHsl } from "./oklch";
import { apcaContrast } from "./apca";

/** Semantic hues the deeps are built from, independent of the seed. */
const GOOD_H = 145;
const WARN_H = 55;
const BAD_H = 25;
const NEUTRAL_C = 0.006; // a whisper of the seed hue through the greys

export interface GeneratedTheme {
  $about: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Walk lightness from `from` toward `to`, stopping at the first that clears `min` contrast on `ground`. */
function tune(hue: number, chroma: number, ground: string, min: number, from: number, to: number): string {
  const step = from < to ? 0.01 : -0.01;
  let last = oklchToHsl(from, chroma, hue);
  for (let L = from; step > 0 ? L <= to : L >= to; L += step) {
    last = oklchToHsl(L, chroma, hue);
    if (contrast(last, ground) >= min) return last;
  }
  return last; // range exhausted: return the most extreme tried
}

/** The ink — near-white or near-black — that reads best on a fill, by APCA. */
function inkOn(fill: string): string {
  const inks = ["0 0% 100%", "0 0% 10%"];
  const bg = hslToRgb(fill);
  return inks.reduce((best, c) => (apcaContrast(hslToRgb(c), bg) > apcaContrast(hslToRgb(best), bg) ? c : best));
}

function buildMode(hue: number, chroma: number, mode: "light" | "dark"): Record<string, string> {
  const neutral = (L: number) => oklchToHsl(L, NEUTRAL_C, hue);
  const ground = mode === "light" ? { bg: 0.975, surface: 0.995, s2: 0.93 } : { bg: 0.16, surface: 0.205, s2: 0.265 };

  const bg = neutral(ground.bg);
  const surface = neutral(ground.surface);
  const s2 = neutral(ground.s2);

  // Text clears AA on the ground it sits worst against — the darkest in light
  // mode, the lightest in dark mode, which is surface-2 either way.
  const from = mode === "light" ? 0.62 : 0.62;
  const to = mode === "light" ? 0.08 : 0.99;
  const text = (h: number, c: number, min = 4.5) => tune(h, c, s2, min, from, to);

  const ink = text(hue, 0.02, mode === "light" ? 12 : 10);
  const muted = text(hue, 0.02, 4.5);
  const accentDeep = text(hue, Math.min(chroma, 0.13));
  const goodDeep = text(GOOD_H, 0.12);
  const warnDeep = text(WARN_H, 0.13);
  const badDeep = text(BAD_H, 0.15);

  // The accent as a shape (a ring, an active tab): AA for non-text is 3:1,
  // worst against bg in light mode (the darker of the two grounds checked)
  // and against surface in dark mode (the lighter). A hair of margin keeps
  // the 0.01 lightness step from landing at 2.99.
  const shapeGround = mode === "light" ? bg : surface;
  const accent = tune(hue, chroma, shapeGround, 3.1, mode === "light" ? 0.72 : 0.55, mode === "light" ? 0.3 : 0.92);
  const accent2 = oklchToHsl(mode === "light" ? 0.6 : 0.68, chroma, (hue + 150) % 360);

  // A light, saturated fill with the ink APCA says reads on it.
  const brand = oklchToHsl(mode === "light" ? 0.86 : 0.82, Math.min(chroma, 0.15), hue);
  const brandInk = inkOn(brand);

  return {
    bg,
    surface,
    "surface-2": s2,
    line: mode === "light" ? ink : neutral(0.4),
    ink,
    muted,
    accent,
    "accent-2": accent2,
    "good-deep": goodDeep,
    "warn-deep": warnDeep,
    "bad-deep": badDeep,
    "accent-deep": accentDeep,
    "shadow-card": mode === "light" ? "0 1px 2px rgb(0 0 0 / 0.08)" : "0 1px 2px rgb(0 0 0 / 0.45)",
    "line-alpha": mode === "light" ? "0 0% 0% / 0.1" : "0 0% 100% / 0.12",
    "radius-card": "16px",
    brand,
    "brand-ink": brandInk,
  };
}

/** A whole theme from a seed hue (0-360) and chroma (~0.1-0.2). */
export function generateTheme(seedHue: number, seedChroma = 0.15): GeneratedTheme {
  const hue = ((seedHue % 360) + 360) % 360;
  return {
    $about: `generated from hue ${Math.round(hue)}`,
    light: buildMode(hue, seedChroma, "light"),
    dark: buildMode(hue, seedChroma, "dark"),
  };
}
