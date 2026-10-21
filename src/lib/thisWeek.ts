import type { Deadline, Subject } from "@acadkit/core/types";
import type { PrepTest } from "@/lib/examPrep";

/**
 * The Study page's "This week" and "Projects" cards. Their data comes from
 * the study folder's _src through the sync (scripts/lib/weekly.mjs), which
 * has already dropped anything malformed.
 */

/** A short announcement from the weekly scan that isn't a deadline. */
export interface Notice {
  subject_code: string | null;
  text: string;
  /** Where it was announced: a WhatsApp group, a Classroom. */
  source: string | null;
  /** YYYY-MM-DD. */
  posted: string | null;
  /** YYYY-MM-DD: the last day it shows. */
  until: string;
  /** A file in the study folder it points at. */
  file: string | null;
}

export interface NoticesData {
  version: 1;
  generatedAt: number;
  notices: Notice[];
}

export type ProjectState = "active" | "waiting" | "paused" | "done";

export interface Project {
  name: string;
  state: ProjectState;
  status: string;
  next: string | null;
  url: string | null;
}

export interface Todo {
  text: string;
  project: string | null;
  /** YYYY-MM-DD. */
  due: string | null;
}

export interface ProjectsData {
  version: 1;
  generatedAt: number;
  /** YYYY-MM-DD: when the status lines were last written. */
  updated: string | null;
  projects: Project[];
  todos: Todo[];
}

const WEEK_DAYS = 7;
/** The local calendar day of an instant, as YYYY-MM-DD. */
const dayOf = (t: number | string) => new Date(t).toLocaleDateString("en-CA");
const squash = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();

/**
 * Which notice this is, across syncs: the scan rewrites the file every
 * week, so the key is its words and the day it was posted. A reworded
 * notice is news again and comes back.
 */
export const noticeKey = (n: Pick<Notice, "text" | "posted">): string => `${n.posted ?? ""}|${n.text}`;

/** Notices swiped away on this device: key → the notice's last day, so the list can forget them once they'd have gone anyway. */
export type HiddenNotices = Record<string, string>;

/** Notices still running today and not swiped away, newest first. */
export function activeNotices(data: NoticesData | null | undefined, now: number, hidden: HiddenNotices = {}): Notice[] {
  const today = dayOf(now);
  return (data?.notices ?? [])
    .filter((n) => n.until >= today && !(noticeKey(n) in hidden))
    .sort((a, b) => (b.posted ?? "").localeCompare(a.posted ?? "") || a.until.localeCompare(b.until));
}

/** One line of "Coming up": a deadline, its exam prep when the scan wrote some, or both. */
export interface WeekItem {
  key: string;
  due_date: string;
  subject_code: string | null;
  deadline: Deadline | null;
  prep: PrepTest | null;
}

/**
 * Deadlines and tests from now to the end of the seventh day ahead, soonest
 * first. A pending deadline and a prep entry for the same subject on the same
 * day are one test, shown once with its prep.
 */
export function weekAhead(
  deadlines: Deadline[] | undefined,
  prep: PrepTest[] | undefined,
  subjects: Pick<Subject, "id" | "code">[] | undefined,
  now: number
): WeekItem[] {
  const last = dayOf(now + WEEK_DAYS * 86_400_000);
  const inWeek = (iso: string) => new Date(iso).getTime() > now && dayOf(iso) <= last;
  const codeOf = new Map((subjects ?? []).map((s) => [s.id, squash(s.code)]));
  const tests = (prep ?? []).filter((t) => inWeek(t.due_date));
  const used = new Set<PrepTest>();
  const items: WeekItem[] = [];
  for (const d of deadlines ?? []) {
    if (d.status !== "pending" || !inWeek(d.due_date)) continue;
    const code = d.subject_id ? (codeOf.get(d.subject_id) ?? null) : null;
    const match = code
      ? tests.find((t) => !used.has(t) && squash(t.subject_code) === code && dayOf(t.due_date) === dayOf(d.due_date))
      : undefined;
    if (match) used.add(match);
    items.push({ key: d.id, due_date: d.due_date, subject_code: code, deadline: d, prep: match ?? null });
  }
  for (const t of tests) {
    if (used.has(t)) continue;
    const code = squash(t.subject_code);
    items.push({ key: `prep-${code}-${t.due_date}`, due_date: t.due_date, subject_code: code, deadline: null, prep: t });
  }
  return items.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
}

/** "today", "tomorrow", "in 3 days", by calendar day. */
export function daysAway(iso: string, now: number): string {
  const d = Math.round((new Date(dayOf(iso)).getTime() - new Date(dayOf(now)).getTime()) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
}

/** To-dos in the order to do them: dated ones soonest first, then the rest as written. */
export function orderedTodos(todos: Todo[] | undefined): Todo[] {
  return (todos ?? [])
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.due && b.t.due ? a.t.due.localeCompare(b.t.due) : a.t.due ? -1 : b.t.due ? 1 : a.i - b.i))
    .map(({ t }) => t);
}
