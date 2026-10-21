import { useLayoutEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useSubjectByCode } from "@/components/runup/lookup";
import { addDays, formatDate, parseISODate } from "@acadkit/core/dates";
import { dayProgress, eventsOn, type RunupData } from "@/lib/runup";
import { cn } from "@/lib/utils";

/**
 * The phone's way across the plan: every day in one row you can flick
 * through, the open day kept in the middle. A dot in the subject's colour
 * marks a test; otherwise a small dot says how much of the day is ticked.
 */
export function DayStrip({
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
  const subjectByCode = useSubjectByCode();
  const scroller = useRef<HTMLDivElement>(null);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = plan.start; d <= plan.end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [plan.start, plan.end]);

  // Centre the open day without moving the page itself (scrollIntoView would).
  useLayoutEffect(() => {
    const box = scroller.current;
    const chip = box?.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (!box || !chip) return;
    box.scrollTo({ left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2, behavior: "auto" });
  }, [selected]);

  return (
    <nav aria-label="Days" className="-mx-4">
      <div ref={scroller} className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 py-1">
        {days.map((date) => {
          const p = dayProgress(plan, date, done);
          const events = eventsOn(plan, date);
          const d = parseISODate(date);
          const active = date === selected;
          return (
            <Link
              key={date}
              to={`/runup/${date}`}
              replace
              data-day={date}
              aria-current={active ? "date" : undefined}
              aria-label={[formatDate(date, { weekday: "long", month: "long" }), p.total ? `${p.done} of ${p.total} done` : null, ...events.map((e) => e.title)]
                .filter(Boolean)
                .join(", ")}
              className={cn(
                "flex w-11 shrink-0 flex-col items-center rounded-2xl py-2 transition-colors",
                active ? "bg-brand text-brand-ink" : "bg-surface-2/70",
                date === today && !active && "ring-2 ring-accent"
              )}
            >
              <span className={cn("text-[10px] font-bold uppercase", active ? "text-bg/80" : "text-muted")}>
                {d.toLocaleDateString("en-IN", { weekday: "narrow" })}
              </span>
              <span className="text-base font-extrabold tabular leading-tight">{d.getDate()}</span>
              <span className="mt-0.5 flex h-1.5 items-center gap-0.5" aria-hidden>
                {events.slice(0, 2).map((e) => (
                  <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: subjectByCode(e.subject_code)?.color_hex ?? "currentColor" }} />
                ))}
                {events.length === 0 && p.total > 0 && (
                  <span
                    className={cn(
                      "h-1 w-1 rounded-full",
                      p.done === p.total ? "bg-good" : p.done > 0 ? "bg-warn" : active ? "bg-bg/60" : "bg-muted/50"
                    )}
                  />
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
