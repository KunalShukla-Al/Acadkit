/**
 * The Desk's data (docs/desk.md): an index of courses, one part per course
 * (scripts/lib/desk.mjs), and what you've done with each item
 * (desk_progress, migration 065). Everything here is pure, so the screens
 * and their tests share it.
 */

export type DeskKind = "ct" | "end" | "sister" | "old";
export type DeskPart = "A" | "B" | "C" | "D";
export type DeskStatus = "new" | "learning" | "done" | "revise";
export type DeskResult = "correct" | "wrong" | "unreviewed";

export interface DeskFile {
  path: string;
  name: string;
  kind?: string;
  when?: string;
}

export interface DeskItem {
  key: string;
  unit: number | null;
  topic: string | null;
  topicName: string | null;
  kind: DeskKind;
  paper: string;
  slot: string;
  part: DeskPart;
  marks: number | null;
  mcq: boolean;
  text: string;
  options: string[];
  answer: string | null;
  note: string | null;
  file: string | null;
  page: number | null;
  date: string | null;
  repeats: number;
  solution: { file: string; page: number | null } | null;
}

export interface DeskTestRow {
  topic: string;
  name: string;
  unit: number | null;
  seen: number;
  of: number;
  exp: number;
  tier: string;
}

export interface DeskTest {
  id: string;
  name: string;
  when: string | null;
  units: number[];
  note: string | null;
  papers: number | null;
  mcqOnly: boolean;
  rows: DeskTestRow[];
  steps: { topic: string; name: string; share: number; full: number }[];
  start: string | null;
  end: string | null;
  date: string | null;
  weight: number | null;
  provisional: boolean;
}

export interface DeskUnitQuestion {
  text: string;
  marks: number | null;
  mcq: boolean;
  kind: DeskKind;
  src: string[];
  papers: number;
}

export interface DeskUnitTopic {
  topic: string;
  name: string;
  ct: number;
  end: number;
  ofCt: number;
  ofEnd: number;
  perPaper: number;
  questions: DeskUnitQuestion[];
}

export interface DeskVideo {
  id: string;
  title: string | null;
  teacher: string | null;
  secs: number | null;
  layer: string | null;
}

export interface DeskUnit {
  n: number;
  title: string | null;
  topics: { n: number | null; title: string; videos: DeskVideo[] }[];
  pyq: DeskUnitTopic[];
  questions: number;
  ctQuestions: number;
  notes: DeskFile[];
}

export interface DeskCourse {
  key: string;
  code: string | null;
  name: string;
  folder: string | null;
  semester: string | null;
  elective: string | null;
  credits: number | null;
  showUntil: string | null;
  reports: { predict?: string; repeats?: string; masterList?: string };
  floor: number | null;
  endsems: number | null;
  askedBefore: number | null;
  backtest: { count?: number; recent?: number; all?: number; random?: number } | null;
  tests: DeskTest[];
  lockin: { slot: string; unit: number | null; chain: { names: string[]; count: number }[] }[];
  units: DeskUnit[];
  notes: DeskFile[];
  papers: DeskFile[];
  items: DeskItem[];
}

export interface DeskIndexTest {
  id: string;
  name: string;
  units: number[];
  start: string | null;
  end: string | null;
  date: string | null;
  weight: number | null;
  provisional: boolean;
}

export interface DeskIndexCourse {
  key: string;
  code: string | null;
  name: string;
  semester: string | null;
  showUntil: string | null;
  items: number;
  keyed: number;
  solved: number;
  tests: DeskIndexTest[];
  file: string;
}

export interface DeskWindow {
  key: string;
  label: string;
  start: string;
  end: string;
  semester: string | null;
}

export interface DeskIndex {
  version: 1;
  built: string | null;
  windows: DeskWindow[];
  courses: DeskIndexCourse[];
}

export interface DeskProgress {
  item_key: string;
  status: DeskStatus | null;
  flag: boolean;
  pick: string | null;
  attempted_at: string | null;
  result: DeskResult | null;
  note: string | null;
  updated_at: string;
}

export const LETTERS = "ABCDEF";

export const KIND_LABEL: Record<DeskKind, string> = {
  ct: "Class test",
  end: "End-sem",
  sister: "Sister course",
  old: "Old syllabus",
};

export const STATUS_LABEL: Record<DeskStatus, string> = {
  new: "Not started",
  learning: "Learning",
  done: "Done",
  revise: "Revise",
};

/** Progress keys for a syllabus topic ("topic:PS:1.2") and a lecture video ("video:<YouTube id>"). */
export const topicKey = (course: string, unit: number, topic: number | null) => `topic:${course}:${unit}.${topic ?? 0}`;
export const videoKey = (id: string) => `video:${id}`;

/** The courses still shown on `today`: a course with `showUntil` goes the day after it. */
export function visibleCourses<T extends { showUntil: string | null }>(courses: T[], today: string): T[] {
  return courses.filter((c) => !c.showUntil || today <= c.showUntil);
}

/** Progress rows by item key. */
export function progressMap(rows: DeskProgress[] | undefined): Map<string, DeskProgress> {
  return new Map((rows ?? []).map((r) => [r.item_key, r]));
}

/** A blank row for `key`, for a first write. */
export function blankProgress(item_key: string): DeskProgress {
  return { item_key, status: null, flag: false, pick: null, attempted_at: null, result: null, note: null, updated_at: new Date(0).toISOString() };
}

/** A pick's grade: correct or wrong where the item has a key, unreviewed where it has none. */
export function gradePick(item: Pick<DeskItem, "answer" | "options">, pick: string): DeskResult {
  if (!item.answer || LETTERS.indexOf(pick) < 0 || LETTERS.indexOf(pick) >= item.options.length) return "unreviewed";
  return pick === item.answer ? "correct" : "wrong";
}

export type PracticeStatus = "all" | "new" | "attempted" | "wrong" | "flagged";

export interface PracticeFilter {
  unit: number | null;
  topic: string | null;
  kind: DeskKind | null;
  part: DeskPart | null;
  status: PracticeStatus;
  query: string;
}

export const NO_FILTER: PracticeFilter = { unit: null, topic: null, kind: null, part: null, status: "all", query: "" };

/** The filter a URL's query names (`?unit=2&kind=ct&part=A&status=wrong&topic=…&q=…`). */
export function filterFrom(params: URLSearchParams): PracticeFilter {
  const unit = Number(params.get("unit"));
  const kind = params.get("kind");
  const part = params.get("part");
  const status = params.get("status");
  return {
    unit: Number.isInteger(unit) && unit > 0 ? unit : null,
    topic: params.get("topic") || null,
    kind: kind && kind in KIND_LABEL ? (kind as DeskKind) : null,
    part: part && /^[ABCD]$/.test(part) ? (part as DeskPart) : null,
    status: status && ["new", "attempted", "wrong", "flagged"].includes(status) ? (status as PracticeStatus) : "all",
    query: params.get("q")?.trim() ?? "",
  };
}

/** The items a filter keeps, in the order they came. */
export function filterItems(items: DeskItem[], f: PracticeFilter, progress: Map<string, DeskProgress>): DeskItem[] {
  const q = f.query.toLowerCase();
  return items.filter((i) => {
    if (f.unit !== null && i.unit !== f.unit) return false;
    if (f.topic !== null && i.topic !== f.topic) return false;
    if (f.kind !== null && i.kind !== f.kind) return false;
    if (f.part !== null && i.part !== f.part) return false;
    if (q && !i.text.toLowerCase().includes(q) && !i.paper.toLowerCase().includes(q)) return false;
    const p = progress.get(i.key);
    switch (f.status) {
      case "new":
        return !p?.attempted_at;
      case "attempted":
        return !!p?.attempted_at;
      case "wrong":
        return p?.result === "wrong";
      case "flagged":
        return !!p?.flag;
      default:
        return true;
    }
  });
}

/** Practice coverage for a set of items: attempted, right among graded, keys and worked answers. */
export function coverage(items: DeskItem[], progress: Map<string, DeskProgress>) {
  let attempted = 0;
  let correct = 0;
  let graded = 0;
  let flagged = 0;
  for (const i of items) {
    const p = progress.get(i.key);
    if (p?.attempted_at) attempted++;
    if (p?.flag) flagged++;
    if (p?.result === "correct" || p?.result === "wrong") {
      graded++;
      if (p.result === "correct") correct++;
    }
  }
  const mcqs = items.filter((i) => i.mcq);
  return {
    total: items.length,
    attempted,
    correct,
    graded,
    flagged,
    mcqs: mcqs.length,
    keyed: mcqs.filter((i) => i.answer).length,
    written: items.length - mcqs.length,
    solved: items.filter((i) => !i.mcq && i.solution).length,
  };
}

/** The topics the items cover, with names, by unit then first appearance. */
export function topicsOf(items: DeskItem[]): { topic: string; name: string; unit: number | null; count: number }[] {
  const out = new Map<string, { topic: string; name: string; unit: number | null; count: number }>();
  for (const i of items) {
    if (!i.topic) continue;
    const t = out.get(i.topic) ?? { topic: i.topic, name: i.topicName ?? i.topic, unit: i.unit, count: 0 };
    t.count++;
    out.set(i.topic, t);
  }
  return [...out.values()].sort((a, b) => (a.unit ?? 99) - (b.unit ?? 99));
}

/** A test's day for a countdown: its exact day once set, else its window's first day. */
export function testDay(t: Pick<DeskTest, "date" | "start">): string | null {
  return t.date ?? t.start;
}

/** Whole days from `today` to `day` (both YYYY-MM-DD). */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function countdown(day: string, today: string): string {
  const n = daysUntil(day, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** Every test of the shown courses, soonest first, undated last. */
export function upcomingTests(courses: DeskIndexCourse[], today: string) {
  const all = courses.flatMap((c) =>
    c.tests.map((t) => ({ course: c, test: t, day: testDay(t), last: t.end ?? t.date ?? t.start }))
  );
  return all
    .filter((x) => !x.last || x.last >= today)
    .sort((a, b) => (a.day ?? "9999").localeCompare(b.day ?? "9999") || a.course.key.localeCompare(b.course.key));
}

/** Windows that touch the month `ym` ("2027-01"), with the days of it they cover. */
export function windowsInMonth(windows: DeskWindow[], ym: string) {
  const first = `${ym}-01`;
  const last = `${ym}-31`;
  return windows.filter((w) => w.start <= last && w.end >= first);
}

/** True when `day` is inside a window. */
export function inWindow(w: Pick<DeskWindow, "start" | "end">, day: string): boolean {
  return w.start <= day && day <= w.end;
}

/** The prompt for Claude: the question and what it needs to answer it from the study folder. */
export function askPrompt(course: Pick<DeskCourse, "key" | "name" | "folder">, item: DeskItem, question: string): string {
  const lines = [
    `Course: ${course.name} (${course.key})${course.folder ? `, folder ${course.folder}` : ""}`,
    `Question (${item.paper}, ${item.slot}, ${item.marks ?? "?"} marks): ${item.text}`,
  ];
  if (item.options.length) lines.push(`Options: ${item.options.map((o, i) => `${LETTERS[i]}. ${o}`).join(" | ")}`);
  if (item.file) lines.push(`Paper: ${item.file}${item.page ? `, page ${item.page}` : ""}`);
  if (item.solution) lines.push(`Worked answer: ${item.solution.file}${item.solution.page ? `, page ${item.solution.page}` : ""}`);
  lines.push("", question.trim() || "Write an exam-ready answer.");
  return lines.join("\n");
}

/** Claude on the web with the prompt filled in, for when the Mac is away. */
export function claudeUrl(prompt: string): string {
  return `https://claude.ai/new?q=${encodeURIComponent(prompt.slice(0, 6000))}`;
}
