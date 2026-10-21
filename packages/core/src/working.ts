/**
 * A number's working: the steps that make it, so the app can show how it
 * was worked out (Show your work) and an explainer can play it. Each step
 * is a sentence that reads on its own, the caption, and its sum when it has
 * one. `figures` are the numbers the steps used, by name, for drawing.
 *
 * A function that returns a number keeps its signature; its `…Working`
 * twin returns the same number with its working.
 */
export interface Step {
  /** "You attended 42 of the 50 classes held." */
  say: string;
  /** "42 ÷ 50 × 100 = 84.0%". */
  sum?: string;
}

export interface Working<T> {
  value: T;
  steps: Step[];
  figures: Record<string, number>;
}

/** "84.0%": a percentage to one place, as the app shows them. */
export const pct = (x: number) => `${(Math.round(x * 10) / 10).toFixed(1)}%`;

/** "1 class", "3 classes". */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "30 Sep", from "2026-09-30". */
export const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
