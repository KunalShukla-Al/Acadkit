import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, TriangleAlert, X } from "lucide-react";
import { usePortalSnapshots, useSettings, useSubjects, useTimetable } from "@/hooks/useData";
import { semesterWindow } from "@acadkit/core/calendar";
import { auditTimetable, describeAudit, suspectAudits } from "@/lib/timetableCheck";
import { formatDate } from "@acadkit/core/dates";
import { cn, haptic } from "@/lib/utils";

const DISMISSED_KEY = "acadkit:timetable-audit-dismissed";

/** What the state of the timetable is remembered by. */
function signature(codes: string[], gaps: number[]): string {
  return codes.map((c, i) => `${c}:${gaps[i]}`).join("|");
}

function read(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/** The timetable, checked against the one you're actually attending. */
export function TimetableAudit() {
  const { data: subjects } = useSubjects();
  const { data: timetable } = useTimetable();
  const { data: snapshots } = usePortalSnapshots();
  const { data: settings } = useSettings();
  const [dismissed, setDismissed] = useState(read);
  const [open, setOpen] = useState(false);

  const suspects = useMemo(() => {
    if (!subjects?.length || !snapshots?.length) return [];
    return suspectAudits(
      auditTimetable({
        subjects,
        timetable: timetable ?? [],
        snapshots,
        declared: settings?.declared_holidays ?? [],
        window: semesterWindow(settings),
      })
    );
  }, [subjects, timetable, snapshots, settings]);

  const sig = signature(
    suspects.map((s) => s.subject.code),
    suspects.map((s) => s.gap)
  );

  if (!suspects.length || dismissed === sig) return null;

  function hide() {
    haptic(10);
    try {
      window.localStorage.setItem(DISMISSED_KEY, sig);
    } catch {
      // Private mode: the card stays until the next reload, which is a
      // better failure than the dismiss appearing not to work at all.
    }
    setDismissed(sig);
  }

  // One line until opened: the subjects, why it matters, and what the portal counted.
  return (
    <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="card border-warn/40 bg-warn/10">
      <div className="flex items-center gap-3 px-4 py-3">
        <TriangleAlert className="h-4 w-4 shrink-0 text-warn-deep" />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-bold text-warn-deep"
        >
          <span className="min-w-0 flex-1">
            {suspects.length === 1 ? "1 subject doesn't" : `${suspects.length} subjects don't`} match the portal
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} />
        </button>
        <button type="button" aria-label="Dismiss" onClick={hide} className="-m-1 shrink-0 rounded-lg p-1 text-muted hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 pl-11">
          <p className="text-xs text-muted">
            Everything the app projects is counted off these slots, so this is worth a look, though a lab the portal
            counts as two hours will do it too.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {suspects.map((a) => (
              <li key={a.subject.id} className="text-xs">
                <span className="font-semibold">{a.subject.name}</span>
                <span className="text-muted"> - {describeAudit(a)}</span>
                <span className="text-muted"> (portal, {formatDate(a.asOf)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
