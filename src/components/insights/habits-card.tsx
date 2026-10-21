import { useMemo } from "react";
import { Brain } from "lucide-react";
import { useArchives, useAttendance, useMarks, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { buildEffectiveMap, semesterWindow } from "@acadkit/core/calendar";
import { attendanceHabits, classObservations, markHabits, markObservations } from "@acadkit/core/habits";

/** Semesters the record spans: this one, plus each archived one that had marks or classes kept. */
function semesters(archives: { summary?: { marks?: { items: unknown[] }; attendance?: { classes: unknown[] } }[] }[], what: "marks" | "attendance") {
  return 1 + archives.filter((a) => (a.summary ?? []).some((r) => (what === "marks" ? r.marks?.items.length : r.attendance?.classes.length))).length;
}

const pct = (x: number) => `${Math.round(x)}%`;

/**
 * Which kinds of assessment you score higher or lower on than your usual in
 * the same subject - what the grade odds now take into account for the
 * tests still to come (habits.ts, odds.ts v3).
 */
export function MarkHabitsCard() {
  const { data: archives } = useArchives();
  const { data: marks } = useMarks();
  const { data: subjects } = useSubjects();
  const { kinds } = useMemo(() => markHabits(markObservations(archives ?? [], marks ?? [], subjects ?? [])), [archives, marks, subjects]);
  const shown = kinds.filter((k) => k.n >= 2);
  if (shown.length < 2) return null;
  const total = shown.reduce((a, k) => a + k.n, 0);
  const span = semesters(archives ?? [], "marks");
  return (
    <section className="card p-5" aria-label="How you score, by kind of assessment">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
        <Brain className="h-3.5 w-3.5" /> How you score, by kind
      </p>
      <ul className="space-y-2">
        {shown.map((k) => {
          const up = k.offset > 0.15;
          const down = k.offset < -0.15;
          return (
            <li key={k.kind} className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{k.label}</span>
              <span className="text-xs font-medium text-muted tabular">{k.n} marks</span>
              <span className="w-12 text-right text-sm font-bold tabular">{pct(k.pct)}</span>
              <span className={`w-28 text-right text-xs font-semibold ${up ? "text-good-deep" : down ? "text-bad-deep" : "text-muted"}`}>
                {up ? "above your usual" : down ? "below your usual" : "about your usual"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs font-medium text-muted">
        From {total} marks over {span} semester{span === 1 ? "" : "s"}, each compared with your average in the same subject.
      </p>
    </section>
  );
}

/** Which classes you miss more (or less) than your usual: labs, first period, a weekday, a day order. */
export function AttendanceHabitsCard() {
  const { data: archives } = useArchives();
  const { data: attendance } = useAttendance();
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const { data: settings } = useSettings();
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const declared = settings?.declared_holidays;
  const dayOrders = useMemo(
    () => buildEffectiveMap(declared ?? [], semesterWindow({ sem_start: semStart, sem_end: semEnd })),
    [declared, semStart, semEnd]
  );
  const { usual, n, habits } = useMemo(
    () => attendanceHabits(classObservations(archives ?? [], attendance ?? [], subjects ?? [], timetable ?? [], dayOrders)),
    [archives, attendance, subjects, timetable, dayOrders]
  );
  // Worth saying: clearly more, or clearly less, than your usual.
  const more = habits.filter((h) => h.ratio >= 1.3).slice(0, 3);
  const less = habits.filter((h) => h.ratio <= 0.7).slice(-2).reverse();
  if (usual === 0 || (more.length === 0 && less.length === 0)) return null;
  const span = semesters(archives ?? [], "attendance");
  return (
    <section className="card p-5" aria-label="Which classes you miss">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
        <Brain className="h-3.5 w-3.5" /> Which classes you miss
      </p>
      <ul className="space-y-2">
        {[...more, ...less].map((h) => (
          <li key={h.key} className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.label}</span>
            <span className="text-xs font-medium text-muted tabular">{h.n} classes</span>
            <span className={`w-32 text-right text-xs font-semibold ${h.ratio >= 1.3 ? "text-bad-deep" : "text-good-deep"}`}>
              {h.ratio >= 1.3 ? `${h.ratio.toFixed(1)}× your usual` : `${Math.round((1 - h.ratio) * 100)}% less often`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-medium text-muted">
        You usually miss {pct(usual * 100)} of classes. From {n} classes you marked yourself over {span} semester
        {span === 1 ? "" : "s"}; small groups are pulled toward your usual until there's more to go on.
      </p>
    </section>
  );
}
