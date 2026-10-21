import type { PrepTest } from "@/lib/examPrep";
import type { StudyFile } from "@/lib/studyFiles";

/**
 * Tomorrow offline: in the evening, on Wi-Fi, the files for the
 * next day with classes go into this device's file cache
 * (src/lib/fileCache.ts), so they open with no signal on campus. This file
 * decides what and when; src/lib/tomorrowOffline.ts does the fetching.
 */

/** What the last evening's run kept, for Today's line. */
export interface TomorrowState {
  /** The day with classes the files are for, "YYYY-MM-DD". */
  date: string;
  /** Files picked, and how many of them are on this device. */
  files: number;
  ready: number;
  bytes: number;
  at: number;
}

const STATE = "acadkit:tomorrow";
/** Sent when a run has kept files, so Today's line shows them. */
export const TOMORROW_EVENT = "acadkit:tomorrow";

/** The last run as saved, unparsed: the same text until a run saves a new one. */
export function savedTomorrow(): string | null {
  try {
    return localStorage.getItem(STATE);
  } catch {
    return null;
  }
}

export function parseTomorrow(saved: string | null): TomorrowState | null {
  try {
    return JSON.parse(saved ?? "null") as TomorrowState | null;
  } catch {
    return null;
  }
}

export function writeTomorrow(state: TomorrowState) {
  try {
    localStorage.setItem(STATE, JSON.stringify(state));
  } catch {
    // Storage full or off: the files are kept, Today just can't say so.
  }
  window.dispatchEvent(new Event(TOMORROW_EVENT));
}

/**
 * Today's line for a run, or null when there's nothing to say: no file
 * kept, or the day it was for has passed. "Tomorrow's files are on this
 * device" in the evening, "Today's" on the day, the weekday further off.
 */
export function tomorrowLine(state: TomorrowState | null, today: string): string | null {
  if (!state || state.ready === 0 || state.date < today) return null;
  const days = Math.round((Date.parse(state.date) - Date.parse(today)) / 86_400_000);
  const day = days === 0 ? "today" : days === 1 ? "tomorrow" : new Date(`${state.date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "long" });
  if (state.ready < state.files) return `${state.ready} of ${day}'s ${state.files} files are on this device`;
  return `${day[0].toUpperCase()}${day.slice(1)}'s files are on this device`;
}

/** At most this much a night: tomorrow's files, not the semester's. */
export const TOMORROW_CAP = 80 * 1024 * 1024;
/** A course's newest notes kept for its class. */
export const PER_COURSE = 3;
/** From this hour of the evening. */
export const EVENING = 18;

const norm = (code: string | null | undefined) => (code ?? "").replace(/\s/g, "").toUpperCase();

/**
 * What to keep for tomorrow, most needed first: each test's files from its
 * prep, then the newest notes of each course with a class. Within `cap`,
 * skipping any file that wouldn't fit.
 */
export function tomorrowFiles({ files, tests, courses, cap = TOMORROW_CAP }: { files: StudyFile[]; tests: PrepTest[]; courses: string[]; cap?: number }): StudyFile[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const wanted: StudyFile[] = [];
  for (const t of tests) for (const f of t.files) {
    const file = byPath.get(f.path);
    if (file) wanted.push(file);
  }
  for (const code of courses) {
    const notes = files.filter((f) => f.kind === "notes" && norm(f.subject_code) === norm(code)).sort((a, b) => b.mtime - a.mtime);
    wanted.push(...notes.slice(0, PER_COURSE));
  }
  const out: StudyFile[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const f of wanted) {
    if (seen.has(f.path) || total + f.size > cap) continue;
    seen.add(f.path);
    out.push(f);
    total += f.size;
  }
  return out;
}

interface Connection {
  type?: string;
  saveData?: boolean;
}

/**
 * Whether this connection may carry tomorrow's files: Wi-Fi or a cable
 * where the browser says, never with data saving on. iPhone browsers don't
 * say which network they're on; there it fetches, and Settings can stop it.
 */
export function mayFetch(connection: Connection | undefined): boolean {
  if (connection?.saveData) return false;
  if (!connection?.type || connection.type === "unknown") return true;
  return connection.type === "wifi" || connection.type === "ethernet";
}
