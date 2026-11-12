/** How densely a PDF page is drawn: canvas pixels per CSS pixel. */

/** The most pixels one page's canvas may hold. */
export const MAX_CANVAS_PIXELS = 8_000_000;

/** The display's own density, so text stays sharp on a Retina screen, capped at 3× and at what keeps the canvas under MAX_CANVAS_PIXELS. */
export function sharpRatio(devicePixelRatio: number, width: number, aspect: number): number {
  return Math.min(devicePixelRatio || 1, 3, Math.sqrt(MAX_CANVAS_PIXELS / (width * width * aspect)));
}

/** A first pass at 1×, drawn before the sharp one only when that is much denser: on a 2× screen it is a quarter of the pixels, so the page shows sooner. */
export function quickRatio(sharp: number): number | null {
  return sharp >= 1.5 ? 1 : null;
}
