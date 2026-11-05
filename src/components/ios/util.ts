/** Non-component helpers for the iOS screens (kept out of files that export JSX). */

/**
 * The token name for an attendance standing, so colour comes from the
 * theme's mode-tuned `-deep` ramp (readable in light and dark) rather
 * than a fixed bright hue. Use as `hsl(var(--${attnTone(pct, min)}))`.
 */
export function attnTone(pct: number | null, min: number): string {
  if (pct === null) return "muted";
  if (pct >= min) return "good-deep";
  if (pct >= min - 10) return "warn-deep";
  return "bad-deep";
}
