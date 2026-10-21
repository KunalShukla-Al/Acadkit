/** Where you are in a file, for the viewer's page counter: pages where the file has them, screens where it doesn't. */

export type PageState = { current: number; total: number };

/**
 * The page under the line `mid` (a y in the same space as the rects): the
 * one spanning it, else the nearest. `rects` are in reading order; 1-based,
 * 0 when there are none.
 */
export function pageUnder(rects: readonly { top: number; bottom: number }[], mid: number): number {
  let best = 0;
  let gap = Infinity;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.top <= mid && r.bottom >= mid) return i + 1;
    const d = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (d < gap) [best, gap] = [i + 1, d];
    if (r.top > mid) break;
  }
  return best;
}

/** A file with no pages of its own (code, a sheet, a note's web version), counted in screenfuls. */
export function screenPage(scrollTop: number, scrollHeight: number, clientHeight: number): PageState {
  const total = Math.max(1, Math.ceil((scrollHeight - 1) / Math.max(1, clientHeight)));
  const range = scrollHeight - clientHeight;
  // Mapped over the scroll range, so the top reads 1 and the very bottom the last.
  const current = total === 1 || range <= 0 ? 1 : Math.round((Math.min(scrollTop, range) / range) * (total - 1)) + 1;
  return { current, total };
}

/** The scrollTop that shows screen `n` (the inverse of screenPage). */
export function screenTop(n: number, total: number, scrollHeight: number, clientHeight: number): number {
  const range = Math.max(0, scrollHeight - clientHeight);
  return total <= 1 ? 0 : Math.round(((clampPage(n, total) - 1) / (total - 1)) * range);
}

/**
 * The page a sideways drag on the counter lands on: `dx` px from where it
 * started on page `from`. A short file steps a page every 28 px so each is
 * easy to stop on; a long one spreads over `track` px, so one swipe crosses
 * the whole file.
 */
export function scrubPage(from: number, dx: number, total: number, track: number): number {
  const perPage = Math.min(28, Math.max(1.5, track / Math.max(1, total)));
  return clampPage(from + Math.round(dx / perPage), total);
}

/** A typed page number, made one the file has; null for anything that isn't a number. */
export function parsePage(text: string, total: number): number | null {
  const n = Number.parseInt(text.trim(), 10);
  return Number.isFinite(n) ? clampPage(n, total) : null;
}

export function clampPage(n: number, total: number): number {
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, total));
}
