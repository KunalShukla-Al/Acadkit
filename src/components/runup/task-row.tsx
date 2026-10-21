import { Link } from "react-router-dom";
import { Check, Clock3 } from "lucide-react";
import { StudyRefs } from "@/components/study/study-refs";
import { SubjectTag } from "@/components/runup/shared";
import { useSubjectByCode } from "@/components/runup/lookup";
import { formatDate } from "@acadkit/core/dates";
import { eventById, formatMinutes, type DayItem, type RunupData } from "@/lib/runup";
import { cn, haptic } from "@/lib/utils";

/**
 * A task with its tick. The tick is a real button (aria-pressed), so it
 * works from the keyboard on the Mac and with VoiceOver on the phone.
 */
export function TaskRow({
  item,
  plan,
  onToggle,
  showFrom,
  showEvent = true,
}: {
  item: DayItem;
  plan: RunupData;
  onToggle: (taskId: string, done: boolean) => void;
  /** Say which day it was planned for: carried work and an event's list. */
  showFrom?: boolean;
  showEvent?: boolean;
}) {
  const subjectByCode = useSubjectByCode();
  const { task, done, from } = item;
  const event = eventById(plan, task.event);
  const subject = subjectByCode(task.subject_code ?? event?.subject_code);
  const minutes = formatMinutes(task.minutes ?? 0);
  return (
    <li className="flex items-start gap-3 px-4 py-3" data-task={task.id}>
      <button
        type="button"
        onClick={() => {
          haptic();
          onToggle(task.id, !done);
        }}
        aria-pressed={done}
        aria-label={`${done ? "Untick" : "Tick"}: ${task.text}`}
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
          done ? "border-good bg-good text-bg" : "border-line hover:border-accent"
        )}
      >
        {done && <Check className="h-4 w-4" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-semibold leading-snug", done && "text-muted line-through")}>{task.text}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium text-muted">
          <SubjectTag subject={subject} />
          {minutes && (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" aria-hidden />
              {minutes}
            </span>
          )}
          {showFrom && <span>planned {formatDate(from, { weekday: "short" })}</span>}
          {showEvent && event && (
            <Link to={`/runup/event/${encodeURIComponent(event.id)}`} className="font-semibold text-accent-deep hover:underline">
              {event.title}
            </Link>
          )}
        </div>
        {task.files.length > 0 && <StudyRefs refs={task.files.map((path) => ({ path }))} className="mt-2" />}
      </div>
    </li>
  );
}
