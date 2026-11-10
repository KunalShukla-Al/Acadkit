/**
 * APCA (Accessible Perceptual Contrast Algorithm, W3 0.1.9 constants):
 * how legible text actually is, where WCAG's ratio (color.ts) is blunt and
 * polarity-blind. Reported as Lc — roughly ±106 for black/white — signed so
 * dark-on-light is positive and light-on-dark negative. The generator uses
 * it to tune a ramp's lightness, then still clears WCAG AA as the gate.
 */

import type { RGB } from "./oklch";

const Rco = 0.2126729;
const Gco = 0.7151522;
const Bco = 0.072175;
const mainTRC = 2.4;
const blkThrs = 0.022;
const blkClmp = 1.414;
const scale = 1.14;
const loClip = 0.1;
const loOffset = 0.027;
const deltaMin = 0.0005;
const normBG = 0.56;
const normTXT = 0.57;
const revTXT = 0.62;
const revBG = 0.65;

/** Screen luminance with APCA's soft black-level clamp. */
function screenLum([r, g, b]: RGB): number {
  const y = Rco * (r / 255) ** mainTRC + Gco * (g / 255) ** mainTRC + Bco * (b / 255) ** mainTRC;
  return y > blkThrs ? y : y + (blkThrs - y) ** blkClmp;
}

/** Signed Lc of text on a background: + dark-on-light, − light-on-dark, 0 below the floor. */
export function apcaLc(text: RGB, bg: RGB): number {
  const txt = screenLum(text);
  const back = screenLum(bg);
  if (Math.abs(back - txt) < deltaMin) return 0;

  let sapc: number;
  let out: number;
  if (back > txt) {
    sapc = (back ** normBG - txt ** normTXT) * scale;
    out = sapc < loClip ? 0 : sapc - loOffset;
  } else {
    sapc = (back ** revBG - txt ** revTXT) * scale;
    out = sapc > -loClip ? 0 : sapc + loOffset;
  }
  return out * 100;
}

/** Absolute Lc — the plain "how legible" number, polarity set aside. */
export function apcaContrast(text: RGB, bg: RGB): number {
  return Math.abs(apcaLc(text, bg));
}
