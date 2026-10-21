import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BookOpenCheck, CalendarOff, ChevronLeft, ChevronRight, Sunrise, Trophy } from "lucide-react";
import { TaskRow } from "@/components/runup/task-row";
import { caption, EventRow, SubjectTag, TargetText } from "@/components/runup/shared";
import { useSubjectByCode } from "@/components/runup/lookup";
import { useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { useSurvivalPlan } from "@/hooks/useSurvivalPlan";
import { getDayInfo, semesterWindow } from "@acadkit/core/calendar";
import { formatDateLong, formatTime } from "@acadkit/core/dates";
import {
  dayProgress,
  eventsOn,
  formatMinutes,
  itemsFor,
  phase,
  relativeDay,
  totalMinutes,
  undatedEvents,
  upcomingEvents,
  type RunupData,
} from "@/lib/runup";
import { subjectShort } from "@acadkit/core/subjectShort";
import { cn } from "@/lib/utils";

/** What the calendar says about a day: its Day Order and classes, or why there are none. */
function useDayClasses(date: string) {
  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const { data: subjects } = useSubjects();
  const survival = useSurvivalPlan();
  const declared = settings?.declared_holidays;
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  return useMemo(() => {
    const info = getDayInfo(date, declared ?? [], semesterWindow({ sem_start: semStart, sem_end: semEnd }));
    const required = new Set(
      (survival?.days.find((d) => d.date === date)?.classes ?? [])
        .filter((c) => c.required)
        .map((c) => `${c.slot.subject_id}|${c.slot.start_time}`)
    );
    const classes =
      info.dayOrder === null
        ? []
        : (timetable ?? [])
            .filter((s) => s.day_order === info.dayOrder)
            .sort((a, b) => a.start_time.localeCompare(b.start_time))
            .map((slot) => ({
              slot,
              subject: subjects?.find((s) => s.id === slot.subject_id) ?? null,
              required: required.has(`${slot.subject_id}|${slot.start_time}`),
            }));
    return { info, classes };
  }, [date, declared, semStart, semEnd, timetable, subjects, survival]);
}

export function DayView({
  plan,
  done,
  today,
  date,
  onToggle,
  prev,
  next,
}: {
  plan: RunupData;
  done: ReadonlySet<string>;
  today: string;
  date: string;
  onToggle: (taskId: string, done: boolean) => void;
  prev: string | null;
  next: string | null;
}) {
  const subjectByCode = useSubjectByCode();
  const { info, classes } = useDayClasses(date);
  const day = plan.days.find((d) => d.date === date);
  const { planned, carried } = itemsFor(plan, date, done, today);
  const progress = dayProgress(plan, date, done);
  const events = eventsOn(plan, date);
  const coming = upcomingEvents(plan, date > today ? date : today, 4).filter((e) => e.date !== date);
  const undated = undatedEvents(plan);
  const minutes = formatMinutes(totalMinutes([...planned, ...carried].filter((i) => !i.done)));
  const where = phase(plan, today);
  const mustAttend = classes.filter((c) => c.required).length;

  const dayLine =
    info.kind === "working"
      ? `Day Order ${info.dayOrder}`
      : info.kind === "weekend"
        ? "Weekend"
        : info.kind === "official-holiday" || info.kind === "declared-holiday"
          ? (info.holidayName ?? "Holiday")
          : "No classes";

  return (
    <div className="space-y-4">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={caption}>
            {relativeDay(today, date)} · {dayLine}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight lg:text-3xl">
            {formatDateLong(date)}
          </h1>
          {day?.focus && <p className="mt-1 text-sm font-semibold text-accent-deep">{day.focus}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <DayButton to={prev} label="Previous day">
            <ChevronLeft className="h-5 w-5" />
          </DayButton>
          {date !== today && where === "during" && (
            <Link to="/runup" className="rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold hover:bg-surface-2/70">
              Today
            </Link>
          )}
          <DayButton to={next} label="Next day">
            <ChevronRight className="h-5 w-5" />
          </DayButton>
        </div>
      </header>

      {where === "before" && date === plan.start && (
        <Banner icon={Sunrise}>The run-up starts {relativeDay(today, plan.start)}. Here's its first day.</Banner>
      )}
      {where === "after" && date === plan.end && (
        <Banner icon={Trophy}>The run-up is over. This was its last day - well done getting through it.</Banner>
      )}

      {events.map((e) => (
        <Link
          key={e.id}
          to={`/runup/event/${encodeURIComponent(e.id)}`}
          className="card flex items-center gap-3 border-accent/40 bg-accent/10 px-4 py-3"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">
              {date === today ? "Today" : relativeDay(today, date)}: {e.title}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted">
              <SubjectTag subject={subjectByCode(e.subject_code)} />
              {e.weight && <span>{e.weight}</span>}
            </span>
          </span>
          <TargetText event={e} className="shrink-0 text-sm" />
        </Link>
      ))}

      <section className="card overflow-hidden p-0" aria-labelledby="runup-tasks">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <BookOpenCheck className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <h2 id="runup-tasks" className="min-w-0 flex-1 text-sm font-bold">
            Targets for the day
          </h2>
          <span className="text-xs font-semibold text-muted tabular">
            {progress.total > 0 ? `${progress.done}/${progress.total} done` : "nothing planned"}
            {minutes && ` · ${minutes} left`}
          </span>
        </div>
        {progress.total > 0 && (
          <div className="h-1 bg-surface-2" aria-hidden>
            <div className="h-full bg-good transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
        )}
        {planned.length > 0 ? (
          <ul className="divide-y">
            {planned.map((item) => (
              <TaskRow key={item.task.id} item={item} plan={plan} onToggle={onToggle} />
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-muted">
            {carried.length ? "Nothing new for today - clear what's carried below." : "Nothing planned for this day."}
          </p>
        )}
        {carried.length > 0 && (
          <>
            <p className={cn(caption, "border-t bg-surface-2/40 px-4 py-2")}>
              Carried from earlier · {carried.length}
            </p>
            <ul className="divide-y">
              {carried.map((item) => (
                <TaskRow key={item.task.id} item={item} plan={plan} onToggle={onToggle} showFrom />
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card overflow-hidden p-0" aria-labelledby="runup-classes">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <CalendarOff className="h-4 w-4 shrink-0 text-accent" aria-hidden />
          <h2 id="runup-classes" className="min-w-0 flex-1 text-sm font-bold">
            Classes
          </h2>
          {mustAttend > 0 && <span className="text-xs font-bold text-bad-deep">{mustAttend} you can't miss</span>}
        </div>
        {classes.length > 0 ? (
          <ul className="divide-y">
            {classes.map(({ slot, subject, required }) => (
              <li key={slot.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-16 shrink-0 text-xs font-semibold text-muted tabular">{formatTime(slot.start_time)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {subject ? subjectShort(subject) : "Class"}
                  {slot.slot_type === "lab" && <span className="text-muted"> · lab</span>}
                </span>
                {required && (
                  <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-bold text-bad-deep">must attend</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">No classes - a full day for the plan.</p>
        )}
      </section>

      {/* The phone shows what's coming under the day; the desktop has it in its side column. */}
      {(coming.length > 0 || undated.length > 0) && (
        <section className="card divide-y overflow-hidden p-0 lg:hidden" aria-labelledby="runup-coming">
          <h2 id="runup-coming" className={cn(caption, "px-4 py-3")}>
            Coming up
          </h2>
          {coming.map((e) => (
            <EventRow key={e.id} event={e} today={today} subject={subjectByCode(e.subject_code)} />
          ))}
          {undated.map((e) => (
            <EventRow key={e.id} event={e} today={today} subject={subjectByCode(e.subject_code)} />
          ))}
        </section>
      )}
    </div>
  );
}

function DayButton({ to, label, children }: { to: string | null; label: string; children: React.ReactNode }) {
  if (!to)
    return (
      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-xl text-muted/40">
        {children}
      </span>
    );
  return (
    <Link to={`/runup/${to}`} replace aria-label={label} className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2 hover:bg-surface-2/70">
      {children}
    </Link>
  );
}

function Banner({ icon: Icon, children }: { icon: typeof Sunrise; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm font-semibold">
      <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      {children}
    </p>
  );
}
