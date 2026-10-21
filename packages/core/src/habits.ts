/**
 * What your own record says about you, learned from this semester and every
 * archived one (archivePattern.ts):
 *
 *   - which kinds of assessment you score higher or lower on than your usual
 *     in the same subject (a 5-mark assignment vs a CT vs a lab record), as a
 *     shift the grade odds apply to what's still to come (odds.ts);
 *   - which classes you miss more than your usual: labs or theory, first
 *     period or afternoon, which weekday or day order.
 *
 * Small-data statistics, not a black box: every estimate starts at "no
 * difference" and moves only as far as the evidence pushes it (shrinkage),
 * so two lucky assignments don't rewrite your forecast. Auto-marked classes
 * are left out - they're the app's guess, not what you did.
 */
import { isAttended, isCounted } from "./attendance.ts";
import type { AttendanceRecord, Mark, MarkComponentType, SemesterArchive, Subject, SubjectType, TimetableSlot } from "./types.ts";

// ---------- marks ----------

/** A kind of assessment: its type, with the small ones (5 marks or fewer) on their own. */
export function markKind(type: MarkComponentType, max: number): string {
  if (type === "External") return "External";
  return max <= 5 ? `${type}:quick` : type;
}

const KIND_LABELS: Record<string, string> = {
  CT: "Class tests",
  "CT:quick": "5-mark tests",
  Assignment: "Assignments",
  "Assignment:quick": "5-mark assignments",
  Lab: "Lab marks",
  "Lab:quick": "Small lab marks",
  Project: "Projects",
  "Project:quick": "Small project marks",
  External: "End-sems",
};
export const kindLabel = (k: string) => KIND_LABELS[k] ?? k;

export interface MarkObservation {
  /** One subject in one semester: what the comparison is made within. */
  group: string;
  kind: string;
  /** Share of the marks scored, 0–1. */
  ratio: number;
}

/** Every mark you've had: this semester's and each archived semester's. */
export function markObservations(archives: SemesterArchive[], marks: Mark[], subjects: Pick<Subject, "id">[]): MarkObservation[] {
  const out: MarkObservation[] = [];
  const current = new Set(subjects.map((s) => s.id));
  for (const m of marks) {
    if (!current.has(m.subject_id) || m.max_marks <= 0) continue;
    out.push({ group: `now:${m.subject_id}`, kind: markKind(m.component_type, m.max_marks), ratio: m.marks_obtained / m.max_marks });
  }
  for (const a of archives) {
    for (const r of a.summary ?? []) {
      for (const m of r.marks?.items ?? []) {
        if (m.max <= 0) continue;
        out.push({ group: `${a.id}:${r.code}`, kind: markKind(m.type, m.max), ratio: m.got / m.max });
      }
    }
  }
  return out;
}

export interface KindHabit {
  kind: string;
  label: string;
  /** Marks of this kind the estimate rests on. */
  n: number;
  /** Your average on this kind, as a percentage. */
  pct: number;
  /** How far above (+) or below (−) your usual in the same subject, on the logit scale, after shrinkage. */
  offset: number;
}

/** Marks of a kind it takes to move an estimate halfway from "no difference" to what they say. */
const KIND_PRIOR = 3;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const logit = (p: number) => {
  const q = clamp(p, 0.02, 0.98);
  return Math.log(q / (1 - q));
};

/** Per kind of assessment: how you do on it compared with your usual in the same subject. */
export function markHabits(obs: MarkObservation[]): { kinds: KindHabit[]; offsets: Map<string, number> } {
  const byGroup = new Map<string, MarkObservation[]>();
  for (const o of obs) byGroup.set(o.group, [...(byGroup.get(o.group) ?? []), o]);
  const sums = new Map<string, { d: number; n: number; ratio: number }>();
  for (const items of byGroup.values()) {
    // A subject with one mark says nothing about kinds: it IS its own average.
    if (items.length < 2) continue;
    const usual = logit(items.reduce((a, o) => a + clamp(o.ratio, 0, 1), 0) / items.length);
    for (const o of items) {
      const s = sums.get(o.kind) ?? { d: 0, n: 0, ratio: 0 };
      s.d += logit(clamp(o.ratio, 0, 1)) - usual;
      s.n += 1;
      s.ratio += clamp(o.ratio, 0, 1);
      sums.set(o.kind, s);
    }
  }
  const kinds = [...sums]
    .map(([kind, s]) => ({ kind, label: kindLabel(kind), n: s.n, pct: (100 * s.ratio) / s.n, offset: s.d / (s.n + KIND_PRIOR) }))
    .sort((a, b) => b.offset - a.offset);
  return { kinds, offsets: new Map(kinds.filter((k) => k.n >= 2).map((k) => [k.kind, k.offset])) };
}

// ---------- attendance ----------

export interface ClassObservation {
  missed: boolean;
  session: SubjectType;
  /** Start hour, 0–23. */
  hour: number;
  /** 0 = Sunday. */
  weekday: number;
  dayOrder: number | null;
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay();

/** Every class you marked yourself: this semester's and each archived semester's. */
export function classObservations(
  archives: SemesterArchive[],
  records: AttendanceRecord[],
  subjects: Pick<Subject, "id" | "type">[],
  timetable: TimetableSlot[],
  dayOrders: Record<string, number>
): ClassObservation[] {
  const out: ClassObservation[] = [];
  const type = new Map(subjects.map((s) => [s.id, s.type]));
  for (const r of records) {
    if (!type.has(r.subject_id) || r.auto_marked || !isCounted(r.status)) continue;
    const dayOrder = dayOrders[r.date] ?? null;
    const slot = timetable.find((s) => s.subject_id === r.subject_id && s.day_order === dayOrder && s.start_time.slice(0, 5) === r.start_time.slice(0, 5));
    out.push({
      missed: !isAttended(r.status),
      session: slot?.slot_type ?? type.get(r.subject_id)!,
      hour: Number(r.start_time.slice(0, 2)),
      weekday: weekdayOf(r.date),
      dayOrder,
    });
  }
  for (const a of archives) {
    for (const row of a.summary ?? []) {
      for (const c of row.attendance?.classes ?? []) {
        // Classes archived before session and day order were kept: [date, start, status].
        const t = c as unknown as unknown[];
        const old = t.length < 7;
        const status = (old ? t[2] : t[3]) as ClassStatus;
        if ((!old && t[6]) || !isCounted(status)) continue;
        out.push({
          missed: !isAttended(status),
          session: (old ? (row.marks?.subjectType ?? "theory") : t[5]) as SubjectType,
          hour: Number(String(t[1]).slice(0, 2)),
          weekday: weekdayOf(String(t[0])),
          dayOrder: old ? null : ((t[4] as number | null) ?? null),
        });
      }
    }
  }
  return out;
}
type ClassStatus = AttendanceRecord["status"];

export interface MissHabit {
  key: string;
  label: string;
  n: number;
  /** Share missed, after shrinkage toward your usual. */
  rate: number;
  /** rate ÷ your usual: 2 means twice as often. */
  ratio: number;
}

/** Classes it takes to move a miss rate halfway from your usual to what they say. */
const CLASS_PRIOR = 20;
/** Fewer classes than this in a group and it isn't shown. */
const MIN_CLASSES = 8;
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** Which classes you miss more (or less) than your usual. */
export function attendanceHabits(obs: ClassObservation[]): { usual: number; n: number; habits: MissHabit[] } {
  const n = obs.length;
  const usual = n ? obs.filter((o) => o.missed).length / n : 0;
  const groups = new Map<string, { label: string; n: number; missed: number }>();
  const add = (key: string, label: string, o: ClassObservation) => {
    const g = groups.get(key) ?? { label, n: 0, missed: 0 };
    g.n += 1;
    g.missed += o.missed ? 1 : 0;
    groups.set(key, g);
  };
  for (const o of obs) {
    add(`session:${o.session}`, o.session === "lab" ? "Labs" : "Theory classes", o);
    if (o.hour < 9) add("time:first", "First period (before 9)", o);
    else if (o.hour >= 14) add("time:afternoon", "Afternoon classes (2 PM on)", o);
    add(`weekday:${o.weekday}`, WEEKDAYS[o.weekday], o);
    if (o.dayOrder) add(`dayorder:${o.dayOrder}`, `Day order ${o.dayOrder}`, o);
  }
  const habits = [...groups]
    .filter(([, g]) => g.n >= MIN_CLASSES)
    .map(([key, g]) => {
      const rate = (g.missed + CLASS_PRIOR * usual) / (g.n + CLASS_PRIOR);
      return { key, label: g.label, n: g.n, rate, ratio: usual > 0 ? rate / usual : 1 };
    })
    .sort((a, b) => b.ratio - a.ratio);
  return { usual, n, habits };
}
