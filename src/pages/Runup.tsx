import { useCallback, useEffect } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CalendarRange } from "lucide-react";
import { DayStrip } from "@/components/runup/day-strip";
import { DayView } from "@/components/runup/day-view";
import { PlanCalendar } from "@/components/runup/plan-calendar";
import { caption, EventRow } from "@/components/runup/shared";
import { useSubjectByCode } from "@/components/runup/lookup";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { useSetPlanTick } from "@/hooks/useData";
import { useRunup, useTodayISO } from "@/hooks/useRunup";
import { useSwipe } from "@/hooks/useSwipe";
import { openingDay, parseDay, phase, stepDay, undatedEvents, upcomingEvents } from "@/lib/runup";
import { cn } from "@/lib/utils";

/**
 * The run-up, one day at a time: today's targets to tick, anything left
 * from earlier days, the classes you can't miss, and what's coming. The
 * phone flicks between days (the strip, or a swipe); the Mac keeps the
 * whole calendar beside the day and takes the arrow keys.
 */
export default function Runup() {
  const { date: param } = useParams();
  const navigate = useNavigate();
  const today = useTodayISO();
  const { plan, done } = useRunup();
  const tick = useSetPlanTick();
  const subjectByCode = useSubjectByCode();

  const data = plan.data ?? null;
  const parsed = parseDay(param);
  const date = data ? (parsed && phase(data, parsed) === "during" ? parsed : openingDay(data, today)) : null;
  const prev = data && date && date > data.start ? stepDay(data, date, -1) : null;
  const next = data && date && date < data.end ? stepDay(data, date, 1) : null;

  const go = useCallback((to: string | null) => to && navigate(`/runup/${to}`, { replace: true }), [navigate]);
  const swipe = useSwipe(
    () => go(next),
    () => go(prev)
  );

  // The Mac: arrows move a day, T comes back to today. Never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") go(prev);
      else if (e.key === "ArrowRight") go(next);
      else if (e.key === "t" || e.key === "T") navigate("/runup", { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, prev, next, navigate]);

  if (plan.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data || !date) {
    return (
      <EmptyState
        icon={CalendarRange}
        title={plan.isError ? "Couldn't load the run-up" : "No run-up yet"}
        description={
          plan.isError
            ? "Check your connection - the last plan you opened shows here offline once it has loaded once."
            : "It comes from your study folder (_src/acadkit_runup.json) at the next sync."
        }
      />
    );
  }

  // A date outside the plan, or not a date at all: back to the day it would open on.
  if (param && parsed !== date) return <Navigate to="/runup" replace />;

  const onToggle = (task_id: string, isDone: boolean) => tick.mutate({ task_id, done: isDone });
  const coming = upcomingEvents(data, today, 8);
  const undated = undatedEvents(data);

  return (
    <div className="lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8">
      <aside className="hidden lg:block">
        <div className="sticky top-8 max-h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto pb-4 scrollbar-none">
          <PlanCalendar plan={data} done={done} today={today} selected={date} />
          {(coming.length > 0 || undated.length > 0) && (
            <section className="card divide-y overflow-hidden p-0" aria-label="Coming up">
              <p className={cn(caption, "px-4 py-3")}>Coming up</p>
              {[...coming, ...undated].map((e) => (
                <EventRow key={e.id} event={e} today={today} subject={subjectByCode(e.subject_code)} />
              ))}
            </section>
          )}
          <p className="px-1 text-[11px] font-medium text-muted">← → move a day · T for today</p>
        </div>
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="lg:hidden">
          <DayStrip plan={data} done={done} today={today} selected={date} />
        </div>
        <div {...swipe} className="touch-pan-y">
          <DayView
            plan={data}
            done={done}
            today={today}
            date={date}
            onToggle={onToggle}
            prev={prev}
            next={next}
          />
        </div>
      </div>
    </div>
  );
}
