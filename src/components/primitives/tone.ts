/** What a figure's or a value's colour says: nothing in particular, good, close, bad, or live. */
export type Tone = "ink" | "good" | "warn" | "bad" | "accent";

export const TONE: Record<Tone, string> = {
  ink: "text-ink",
  good: "text-good-deep",
  warn: "text-warn-deep",
  bad: "text-bad-deep",
  accent: "text-accent-deep",
};
