import { Link } from "react-router-dom";
import { CalendarClock, Target } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { eventWhen } from "@/components/runup/lookup";
import type { RunupEvent } from "@/lib/runup";
import { subjectShort } from "@acadkit/core/subjectShort";
import { cn } from "@/lib/utils";
import type { Subject } from "@acadkit/core/types";

export const caption = "text-[11px] font-bold uppercase tracking-widest text-muted";

/** "FDS" with its colour dot, or nothing when the code isn't one of your subjects. */
export function SubjectTag({ subject, className }: { subject: Subject | null; className?: string }) {
  if (!subject) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold text-muted", className)}>
      <Dot color={subject.color_hex} className="h-1.5 w-1.5" />
      {subjectShort(subject)}
    </span>
  );
}

/** "aim 11 / 15". */
export function TargetText({ event, className }: { event: RunupEvent; className?: string }) {
  if (!event.target) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular", className)}>
      <Target className="h-3.5 w-3.5 text-accent" aria-hidden />
      aim {event.target.score} / {event.target.max}
    </span>
  );
}

/** One row per event: subject, title, when, and the target. Opens the event. */
export function EventRow({ event, today, subject }: { event: RunupEvent; today: string; subject: Subject | null }) {
  return (
    <Link
      to={`/runup/event/${encodeURIComponent(event.id)}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2/60"
    >
      <CalendarClock className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{event.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs font-medium text-muted">
          <SubjectTag subject={subject} />
          <span>{eventWhen(event, today)}</span>
        </span>
      </span>
      <TargetText event={event} className="shrink-0 text-xs" />
    </Link>
  );
}
