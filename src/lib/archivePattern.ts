/**
 * What a semester keeps of each subject when it's archived, beyond its
 * grade: how attendance went (every class, and the portal's count over the
 * term), how the marks were made up, and what the forecasts said along the
 * way. Everything else of the semester is cleared when the next one starts
 * (Wrapped's "Start the new semester", scripts/lib/semester.mjs).
 *
 * It's what the app learns your habits from (packages/core/src/habits.ts): which kinds
 * of assessment you score higher on, which classes you tend to miss, and how
 * far the forecasts were off. So each record carries what those questions
 * need - the session type and day order of a class, the kind and size of a
 * mark - not just a count.
 *
 * Classes, portal readings and forecasts are tuples, not objects: a term has
 * a few hundred of them and they sit in one jsonb column
 * (semester_archives.summary).
 */
import type {
  ArchivedClass,
  AttendancePattern,
  AttendanceRecord,
  ForecastLogRow,
  Mark,
  MarksPattern,
  PortalSnapshotHistory,
  Subject,
  TimetableSlot,
} from "@acadkit/core/types";


/** The calendar and timetable a class is read against: date → day order, and the subject's slots. */
export interface ClassContext {
  dayOrders: Record<string, number>;
  timetable: TimetableSlot[];
}

export function attendancePattern(
  subject: Subject,
  records: AttendanceRecord[],
  history: PortalSnapshotHistory[],
  counted: { attended: number; total: number } | undefined,
  context: ClassContext = { dayOrders: {}, timetable: [] }
): AttendancePattern {
  const slots = context.timetable.filter((s) => s.subject_id === subject.id);
  const classes = records
    .filter((r) => r.subject_id === subject.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
    .map((r): ArchivedClass => {
      const dayOrder = context.dayOrders[r.date] ?? null;
      // The slot this class was: same day order and start. Its type says lab or theory; else the subject's.
      const slot = slots.find((s) => s.day_order === dayOrder && s.start_time.slice(0, 5) === r.start_time.slice(0, 5));
      return [r.date, r.start_time.slice(0, 5), r.end_time.slice(0, 5), r.status, dayOrder, slot?.slot_type ?? subject.type, r.auto_marked ? 1 : 0];
    });
  // The last reading of each day, and only the days the count moved.
  const byDay = new Map<string, PortalSnapshotHistory>();
  for (const h of history.filter((h) => h.subject_code === subject.code).sort((a, b) => a.synced_at.localeCompare(b.synced_at)))
    byDay.set(h.as_of, h);
  const portal: [string, number, number][] = [];
  for (const h of [...byDay.values()].sort((a, b) => a.as_of.localeCompare(b.as_of))) {
    const last = portal[portal.length - 1];
    if (!last || last[1] !== h.conducted || last[2] !== h.absent) portal.push([h.as_of, h.conducted, h.absent]);
  }
  return { v: 2, attended: counted?.attended ?? 0, total: counted?.total ?? 0, classes, portal };
}

export function marksPattern(subject: Subject, marks: Mark[], forecasts: ForecastLogRow[] = []): MarksPattern {
  const items = marks
    .filter((m) => m.subject_id === subject.id)
    .map((m) => ({
      type: m.component_type,
      label: m.label,
      got: m.marks_obtained,
      max: m.max_marks,
      external: m.is_external,
      on: m.added_at ? m.added_at.slice(0, 10) : null,
      source: m.source ?? null,
    }));
  const a = subject.assessment;
  return {
    v: 2,
    items,
    plan: a ? { internal: a.internal, components: a.components } : null,
    subjectType: subject.type,
    forecasts: forecasts
      .filter((f) => f.scope === subject.id)
      .sort((x, y) => x.week_start.localeCompare(y.week_start))
      .map((f) => [f.week_start, f.median, f.p10, f.p90, f.p_target]),
  };
}

/** "Missed 6 of 48" style line for an archived subject, or null when nothing was recorded. */
export function attendanceLine(p: AttendancePattern | undefined): string | null {
  if (!p || p.total === 0) return null;
  return `Attended ${p.attended} of ${p.total} · missed ${p.total - p.attended}`;
}
