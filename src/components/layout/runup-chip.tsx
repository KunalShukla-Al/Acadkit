import { Link, useLocation } from "react-router-dom";
import { useRunup, useTodayISO } from "@/hooks/useRunup";
import { dayProgress, openingDay } from "@/lib/runup";
import { cn } from "@/lib/utils";

/**
 * The run-up from anywhere: a ring of the day's targets done and the
 * count, in the phone's top bar and the Mac's sidebar. Nothing without a
 * plan.
 */
export function RunupChip({ wide = false }: { wide?: boolean }) {
  const { pathname } = useLocation();
  const today = useTodayISO();
  const { plan, done } = useRunup();
  const data = plan.data;
  if (!data) return null;

  const day = openingDay(data, today);
  const { done: ticked, total } = dayProgress(data, day, done);
  const active = pathname === "/runup" || pathname.startsWith("/runup/");
  const r = 8;
  const length = 2 * Math.PI * r;
  return (
    <Link
      to="/runup"
      aria-current={active ? "page" : undefined}
      aria-label={total ? `Run-up: ${ticked} of ${total} targets done` : "Run-up"}
      className={cn(
        "flex items-center gap-2 rounded-2xl text-sm font-bold transition-colors",
        wide ? "w-full px-3.5 py-2.5" : "px-3 py-2",
        active ? "bg-brand text-brand-ink" : "bg-surface-2/70 text-ink hover:bg-surface-2"
      )}
    >
      <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 -rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" strokeWidth="3" className={active ? "stroke-brand-ink/20" : "stroke-ink/12"} />
        {total > 0 && (
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${(ticked / total) * length} ${length}`}
            className={cn("transition-[stroke-dasharray]", active ? "stroke-brand-ink" : "stroke-brand")}
          />
        )}
      </svg>
      <span className={cn(wide && "flex-1")}>Run-up</span>
      {total > 0 && <span className={cn("tabular", !active && "text-muted")}>{ticked}/{total}</span>}
    </Link>
  );
}
