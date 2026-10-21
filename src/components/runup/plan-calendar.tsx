import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useSubjectByCode } from "@/components/runup/lookup";
import { formatDate, parseISODate } from "@acadkit/core/dates";
import { dayProgress, eventsOn, monthGrid, phase, planMonths, type RunupData } from "@/lib/runup";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * The plan's months, for the desktop column: each day shows how much of it
 * is ticked (a ring that fills), a dot for a test, and a frame for today.
 */
export function PlanCalendar({
  plan,
  done,
  today,
  selected,
}: {
  plan: RunupData;
  done: ReadonlySet<string>;
  today: string;
  selected: string;
}) {
  const months = useMemo(() => planMonths(plan), [plan]);
  return (
    <div className="space-y-5">
      {months.map(([y, m]) => (
        <Month key={`${y}-${m}`} year={y} month={m} plan={plan} done={done} today={today} selected={selected} />
      ))}
    </div>
  );
}

function Month({
  year,
  month,
  plan,
  done,
  today,
  selected,
}: {
  year: number;
  month: number;
  plan: RunupData;
  done: ReadonlySet<string>;
  today: string;
  selected: string;
}) {
  const subjectByCode = useSubjectByCode();
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);
  const name = new Date(year, month, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  return (
    <section aria-label={name}>
      <p className="mb-2 px-1 text-sm font-bold">{name}</p>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="pb-1 text-[10px] font-bold text-muted" aria-hidden>
            {d}
          </span>
        ))}
        {weeks.flat().map((date, i) => {
          if (!date) return <span key={`pad-${i}`} />;
          const inPlan = phase(plan, date) === "during";
          const p = dayProgress(plan, date, done);
          const events = eventsOn(plan, date);
          const label = [
            formatDate(date, { weekday: "long", month: "long" }),
            p.total ? `${p.done} of ${p.total} done` : null,
            ...events.map((e) => e.title),
          ]
            .filter(Boolean)
            .join(", ");
          const cell = (
            <span
              className={cn(
                "relative flex aspect-square w-full flex-col items-center justify-center rounded-xl text-xs font-bold tabular transition-colors",
                date === selected ? "bg-brand text-brand-ink" : inPlan ? "hover:bg-surface-2" : "text-muted/50",
                date === today && date !== selected && "ring-2 ring-accent"
              )}
            >
              {parseISODate(date).getDate()}
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5" aria-hidden>
                {events.slice(0, 3).map((e) => (
                  <span
                    key={e.id}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: subjectByCode(e.subject_code)?.color_hex ?? "currentColor" }}
                  />
                ))}
                {events.length === 0 && p.total > 0 && (
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      p.done === p.total ? "bg-good" : p.done > 0 ? "bg-warn" : date === selected ? "bg-bg/60" : "bg-muted/50"
                    )}
                  />
                )}
              </span>
            </span>
          );
          return inPlan ? (
            <Link key={date} to={`/runup/${date}`} aria-label={label} aria-current={date === selected ? "date" : undefined}>
              {cell}
            </Link>
          ) : (
            <span key={date} aria-hidden>
              {cell}
            </span>
          );
        })}
      </div>
    </section>
  );
}
