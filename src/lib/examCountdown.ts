import { diffDays, toISODate } from "@acadkit/core/dates";
import type { Deadline } from "@acadkit/core/types";

/** The next exam, if it is close enough to be worth shouting about. */

export const HORIZON_DAYS = 21;

/**
 * How long an exam stays on the card after it starts. Long enough to cover
 * sitting it; after that it is over, whether or not it was marked done.
 */
export const LINGER_HOURS = 3;

export interface ExamCountdown {
  deadline: Deadline;
  /** 0 = today, 1 = tomorrow. Never negative. */
  daysAway: number;
}

export function nextExam(
  deadlines: Deadline[] | undefined,
  now: Date = new Date(),
  horizon: number = HORIZON_DAYS
): ExamCountdown | null {
  const today = toISODate(now);
  const candidates = (deadlines ?? [])
    .filter((d) => d.status === "pending" && d.type === "exam")
    .filter((d) => !finished(d.due_date, now))
    .map((d) => ({ deadline: d, daysAway: diffDays(today, d.due_date.slice(0, 10)) }))
    // An exam on an earlier day is history, not a countdown. Today still
    // counts until it has run its course - you may well be sitting it in an hour.
    .filter((c) => c.daysAway >= 0 && c.daysAway <= horizon)
    .sort((a, b) => a.daysAway - b.daysAway);

  return candidates[0] ?? null;
}

/** Started more than LINGER_HOURS ago. A bare date has no start time, so it lasts the day. */
function finished(dueDate: string, now: Date): boolean {
  if (dueDate.length <= 10) return false;
  const start = new Date(dueDate).getTime();
  return now.getTime() >= start + LINGER_HOURS * 3_600_000;
}

/** "today", "tomorrow", "6 days" - the headline of the countdown. */
export function countdownLabel(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `${daysAway} days`;
}

/** How alarming the card should look. */
export type ExamUrgency = "far" | "near" | "imminent";

export function examUrgency(daysAway: number): ExamUrgency {
  if (daysAway <= 1) return "imminent";
  if (daysAway <= 6) return "near";
  return "far";
}
