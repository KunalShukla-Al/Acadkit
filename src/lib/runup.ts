import { addDays, diffDays, parseISODate, toISODate } from "@acadkit/core/dates";
import type { StudyFile } from "@/lib/studyFiles";

/**
 * The run-up: a day-by-day plan to the last end-sem, written in the study
 * folder (_src/acadkit_runup.json), checked by the sync
 * (scripts/lib/runup.mjs) and read here as <pin>/runup.json, an index whose
 * days come a month to a file (`assemble`). What you've done lives apart from it, as ticks (migration 043), so the plan can be
 * rewritten without losing them - a task keeps its tick as long as it
 * keeps its id.
 */

export type RunupKind = "test" | "lab" | "quiz" | "review" | "presentation" | "worksheet" | "endsem" | "other";

export interface RunupTarget {
  score: number;
  max: number;
  note: string | null;
}

export interface RunupPyq {
  /** The paper it came from, e.g. "FJ2 2025 · Set B". */
  source: string | null;
  file: string | null;
  page: number | null;
  number: string | null;
  marks: number | null;
  unit: number | null;
  topic: string | null;
  year: number | null;
  kind: string | null;
  text: string;
}

export interface RunupEvent {
  id: string;
  subject_code: string | null;
  title: string;
  kind: RunupKind;
  /** Null while the date isn't announced; `when` then says what's known. */
  date: string | null;
  when: string | null;
  target: RunupTarget | null;
  weight: string | null;
  format: string | null;
  units: number[];
  portion: string[];
  scoring: string[];
  prepare: string[];
  analysis: { source: string | null; items: { topic: string; seen: string | null; note: string | null }[] } | null;
  /** How many past-paper questions it has. They load with the event's page, from `pyqsFile`. */
  pyqCount: number;
  pyqsFile: string | null;
  /** The questions themselves, in a plan from a sync before the split (`fromV1`). */
  pyqs?: RunupPyq[];
  files: { path: string; why: string | null }[];
}

export interface RunupTask {
  id: string;
  text: string;
  subject_code: string | null;
  event: string | null;
  minutes: number | null;
  files: string[];
}

export interface RunupDay {
  date: string;
  focus: string | null;
  tasks: RunupTask[];
}

/** The whole plan, as the screens use it. */
export interface RunupData {
  generatedAt: number;
  title: string | null;
  start: string;
  end: string;
  events: RunupEvent[];
  days: RunupDay[];
}

/** <pin>/runup.json: the plan without its days, which are in the month files it names. */
export interface RunupIndex extends Omit<RunupData, "days"> {
  version: 2;
  months: string[];
}

/** One month's file. */
export interface RunupMonth {
  days: RunupDay[];
}

/** <pin>/runup.json from a sync before the split: everything in one file. */
export interface RunupFileV1 extends Omit<RunupData, "events"> {
  version: 1;
  events: (Omit<RunupEvent, "pyqCount" | "pyqsFile"> & { pyqs: RunupPyq[] })[];
}

/** The plan from its index and month files, days in date order. */
export function assemble(index: RunupIndex, months: RunupMonth[]): RunupData {
  const { generatedAt, title, start, end, events } = index;
  return { generatedAt, title, start, end, events, days: months.flatMap((m) => m.days).sort((a, b) => a.date.localeCompare(b.date)) };
}

/** A plan from before the split, its questions kept inline. */
export function fromV1(file: RunupFileV1): RunupData {
  const { generatedAt, title, start, end, days } = file;
  return { generatedAt, title, start, end, days, events: file.events.map((e) => ({ ...e, pyqCount: e.pyqs.length, pyqsFile: null })) };
}

/** A task as a day shows it. `from` is the day it was planned for. */
export interface DayItem {
  task: RunupTask;
  from: string;
  done: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A route's date, if it is a real calendar day. */
export function parseDay(value: string | null | undefined): string | null {
  if (!value || !DAY.test(value)) return null;
  return toISODate(parseISODate(value)) === value ? value : null;
}

/** Where a date sits against the plan's window. */
export function phase(data: Pick<RunupData, "start" | "end">, date: string): "before" | "during" | "after" {
  if (date < data.start) return "before";
  if (date > data.end) return "after";
  return "during";
}

/** The date pulled into the plan's window. */
export function clampDay(data: Pick<RunupData, "start" | "end">, date: string): string {
  return date < data.start ? data.start : date > data.end ? data.end : date;
}

/** The day to open on: today inside the window, else its nearest edge. */
export function openingDay(data: Pick<RunupData, "start" | "end">, today: string): string {
  return clampDay(data, today);
}

/** One day forward or back, never leaving the window. */
export function stepDay(data: Pick<RunupData, "start" | "end">, date: string, by: number): string {
  return clampDay(data, addDays(date, by));
}

export function eventById(data: RunupData, id: string | null | undefined): RunupEvent | null {
  if (!id) return null;
  return data.events.find((e) => e.id === id) ?? null;
}

/**
 * Whether an unfinished task still rolls forward to `date`. It stops once
 * the test it was for has happened: revising for a paper you've already
 * sat is not a task any more.
 */
function stillCarries(data: RunupData, task: RunupTask, date: string): boolean {
  const event = eventById(data, task.event);
  return !event?.date || event.date >= date;
}

/**
 * A day's list: what was planned for it, and - on today only - every
 * earlier task left unticked, carried forward. Past and future days show
 * their own plan as it stands.
 */
export function itemsFor(
  data: RunupData,
  date: string,
  done: ReadonlySet<string>,
  today: string
): { planned: DayItem[]; carried: DayItem[] } {
  const day = data.days.find((d) => d.date === date);
  const planned = (day?.tasks ?? []).map((task) => ({ task, from: date, done: done.has(task.id) }));
  if (date !== today) return { planned, carried: [] };
  const carried = data.days
    .filter((d) => d.date < date)
    .flatMap((d) =>
      d.tasks
        .filter((task) => !done.has(task.id) && stillCarries(data, task, date))
        .map((task) => ({ task, from: d.date, done: false }))
    );
  return { planned, carried };
}

/** Ticked and total, over what a day planned (carried tasks count on the day they were planned for). */
export function dayProgress(data: RunupData, date: string, done: ReadonlySet<string>): { done: number; total: number } {
  const tasks = data.days.find((d) => d.date === date)?.tasks ?? [];
  return { done: tasks.filter((t) => done.has(t.id)).length, total: tasks.length };
}

export function eventsOn(data: RunupData, date: string): RunupEvent[] {
  return data.events.filter((e) => e.date === date);
}

/** Dated events from `from` on, soonest first. */
export function upcomingEvents(data: RunupData, from: string, limit = Infinity): RunupEvent[] {
  return data.events
    .filter((e) => e.date !== null && e.date >= from)
    .sort((a, b) => a.date!.localeCompare(b.date!))
    .slice(0, limit);
}

/** Events with no date yet. */
export function undatedEvents(data: RunupData): RunupEvent[] {
  return data.events.filter((e) => e.date === null);
}

/** "today", "tomorrow", "in 5 days", "3 days ago". */
export function relativeDay(from: string, to: string): string {
  const n = diffDays(from, to);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** Ticked and total over every task that prepares for an event. */
export function eventProgress(data: RunupData, eventId: string, done: ReadonlySet<string>): { done: number; total: number } {
  const tasks = data.days.flatMap((d) => d.tasks).filter((t) => t.event === eventId);
  return { done: tasks.filter((t) => done.has(t.id)).length, total: tasks.length };
}

/** Every task for an event, with the day it's planned for. */
export function eventTasks(data: RunupData, eventId: string, done: ReadonlySet<string>): DayItem[] {
  return data.days.flatMap((d) =>
    d.tasks.filter((t) => t.event === eventId).map((task) => ({ task, from: d.date, done: done.has(task.id) }))
  );
}

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();

export interface Material {
  file: StudyFile;
  why: string | null;
  /** Picked by hand for this event, rather than found by its subject and units. */
  picked: boolean;
}

/**
 * What to read for an event: the files the plan names first, then every
 * note, slide deck and guide the sync tagged with the event's subject and
 * one of its units. Past papers aren't repeated here - they have their
 * own list.
 */
export function materialsFor(event: RunupEvent, files: StudyFile[]): Material[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const picked: Material[] = event.files.flatMap((f) => {
    const file = byPath.get(f.path);
    return file ? [{ file, why: f.why, picked: true }] : [];
  });
  if (!event.subject_code || event.units.length === 0) return picked;
  const seen = new Set(picked.map((m) => m.file.path));
  const code = squash(event.subject_code);
  const found = files
    .filter(
      (f) =>
        !seen.has(f.path) &&
        squash(f.subject_code) === code &&
        f.unit != null &&
        event.units.includes(f.unit) &&
        (f.kind === "notes" || f.kind === "guide")
    )
    .sort((a, b) => (a.unit ?? 0) - (b.unit ?? 0) || a.path.localeCompare(b.path))
    .map((file) => ({ file, why: null, picked: false }));
  return [...picked, ...found];
}

export interface PyqGroup {
  source: string;
  file: string | null;
  questions: RunupPyq[];
}

/** Past-paper questions, grouped by the paper they came from, in the plan's order. Optionally one unit only. */
export function pyqGroups(pyqs: RunupPyq[], unit: number | null = null): PyqGroup[] {
  const groups = new Map<string, PyqGroup>();
  for (const q of pyqs) {
    if (unit !== null && q.unit !== unit) continue;
    const source = q.source ?? "Past papers";
    const g = groups.get(source) ?? { source, file: q.file, questions: [] };
    g.questions.push(q);
    groups.set(source, g);
  }
  return [...groups.values()];
}

/** The units past-paper questions fall in, for the filter chips. */
export function pyqUnits(pyqs: RunupPyq[]): number[] {
  return [...new Set(pyqs.map((q) => q.unit).filter((u): u is number => u !== null))].sort((a, b) => a - b);
}

/** How often each topic comes up in past-paper questions, most first. */
export function topicCounts(pyqs: RunupPyq[], limit = 10): { topic: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const q of pyqs) if (q.topic) counts.set(q.topic, (counts.get(q.topic) ?? 0) + 1);
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic))
    .slice(0, limit);
}

/**
 * A month as weeks of dates, Monday first, for the desktop calendar.
 * Days outside the month are null so the grid keeps its shape.
 */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) cells.push(toISODate(new Date(year, month, d)));
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** The months the plan spans, as [year, month] pairs. */
export function planMonths(data: Pick<RunupData, "start" | "end">): [number, number][] {
  const out: [number, number][] = [];
  const s = parseISODate(data.start);
  const e = parseISODate(data.end);
  for (let y = s.getFullYear(), m = s.getMonth(); y < e.getFullYear() || (y === e.getFullYear() && m <= e.getMonth()); ) {
    out.push([y, m]);
    m++;
    if (m === 12) {
      m = 0;
      y++;
    }
  }
  return out;
}

/** Minutes of planned work in a list, for "about 2 h". */
export function totalMinutes(items: DayItem[]): number {
  return items.reduce((n, i) => n + (i.task.minutes ?? 0), 0);
}

export function formatMinutes(min: number): string {
  if (min <= 0) return "";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}
