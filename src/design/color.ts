/** Colours as the tokens write them: HSL triplets, "72 89% 56%". */

/** "72 89% 56%" → [r, g, b], each 0-255. */
export function hslToRgb(hsl: string): [number, number, number] {
  const m = /^\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*$/.exec(hsl);
  if (!m) throw new Error(`Not an HSL triplet: "${hsl}"`);
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)) as [number, number, number];
}

export function hslToHex(hsl: string): string {
  return `#${hslToRgb(hsl)
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** WCAG relative luminance of an sRGB colour. */
export function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two HSL triplets, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(hslToRgb(a)), luminance(hslToRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
