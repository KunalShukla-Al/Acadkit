/**
 * Explainers: a number's working (packages/core/src/working.ts) played as
 * a short animated scene, a step at a time, each step's sentence as its
 * caption. The player and scenes are in src/components/explainer.
 */
import type { Step } from "@acadkit/core/working";

/** The scene's drawing space: 16:9, in SVG units. */
export const STAGE = { width: 320, height: 180 } as const;

/** How long a step stays up while playing: time to read it, its sum read a beat longer. */
export function stepDuration(step: Step): number {
  const ms = 1800 + step.say.length * 45 + (step.sum ? 1500 : 0);
  return Math.min(9000, Math.max(2500, ms));
}

/** How long a whole explainer plays. */
export const totalDuration = (steps: Step[]) => steps.reduce((ms, s) => ms + stepDuration(s), 0);

/** The step after `at`, or null at the end. */
export const nextStep = (at: number, steps: Step[]) => (at + 1 < steps.length ? at + 1 : null);

/** A figure eased from 0 at a step's start to `to` at `p` (0–1) of it: for counters that count up. */
export const tween = (to: number, p: number) => to * (1 - (1 - Math.min(1, Math.max(0, p))) ** 3);

/**
 * How a scene's shapes change between steps, the same in every scene:
 * Motion's spring for where they are and how big, and a short fade for
 * opacity. (Under the e2e specs' frozen clock, opacity starts about two
 * seconds late; on a real clock it fades at once.)
 */
export const SCENE_TRANSITION = { type: "spring", stiffness: 140, damping: 22, opacity: { type: "tween", duration: 0.3, ease: "easeOut" } } as const;

/** How many classes a square stands for in a scene, so up to 60 squares (two rows) hold them all. */
export const classesPerSquare = (total: number) => Math.max(1, Math.ceil(total / 60));

/** How fast a caption is read, the same pace stepDuration allows for. */
const CHAR_MS = 45;
/** A beat before the first word. */
const LEAD_MS = 300;

/**
 * A step's caption at `elapsed` ms into it: its words, and how many are
 * out so far, each word out once the time to read up to it has passed.
 */
export function captionAt(say: string, elapsed: number): { words: string[]; shown: number } {
  const words = say.split(/\s+/).filter(Boolean);
  let chars = 0;
  let shown = 0;
  for (const w of words) {
    if (elapsed < LEAD_MS + chars * CHAR_MS) break;
    chars += w.length + 1;
    shown++;
  }
  return { words, shown };
}

/** A caption with the first `chars` characters spoken: the words out so far, for a voice's pace. */
export function captionUpTo(say: string, chars: number): { words: string[]; shown: number } {
  const words = say.split(/\s+/).filter(Boolean);
  let end = 0;
  let shown = 0;
  for (const w of words) {
    if (end >= chars) break;
    end += w.length + 1;
    shown++;
  }
  return { words, shown };
}
