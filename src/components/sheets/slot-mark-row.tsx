import { motion } from "motion/react";
import { Ban, BadgeCheck, Check, X } from "lucide-react";
import { useAttendance, useMarkAttendance, useUnmarkAttendance } from "@/hooks/useData";
import { isAttended } from "@acadkit/core/attendance";
import { formatTimeRange } from "@acadkit/core/dates";
import { cn, haptic } from "@/lib/utils";
import { Dot } from "@/components/ui/misc";
import type { AttendanceStatus, Subject, TimetableSlot } from "@acadkit/core/types";

const OPTIONS: Array<{
  status: AttendanceStatus;
  label: string;
  icon: typeof Check;
  activeClass: string;
}> = [
  {
    status: "present",
    label: "Present",
    icon: Check,
    activeClass: "bg-good text-emerald-950",
  },
  {
    status: "absent",
    label: "Absent",
    icon: X,
    activeClass: "bg-bad text-rose-950",
  },
  {
    // Attended, but for a different reason - so it borrows Present's
    // colour outlined rather than filled, instead of introducing a hue
    // that would have to mean something new in both themes.
    status: "od",
    label: "On Duty",
    icon: BadgeCheck,
    activeClass: "bg-good/15 text-good-deep ring-2 ring-inset ring-good",
  },
  {
    status: "holiday",
    label: "Off",
    icon: Ban,
    activeClass: "bg-surface-2 text-muted ring-1 ring-inset ring-ink/15",
  },
];

interface SlotMarkRowProps {
  slot: TimetableSlot;
  subject: Subject | undefined;
  date: string;
  /**
   * A class the timetable doesn't schedule. Labelled, because an
   * unexplained extra row reads as a bug in the timetable rather than
   * as the makeup lecture you sat through.
   */
  extra?: boolean;
}

/** One class slot with Present / Absent / Cancelled marking. */
export function SlotMarkRow({
  slot,
  subject,
  date,
  extra = false,
}: SlotMarkRowProps) {
  const { data: attendance } = useAttendance();
  const mark = useMarkAttendance();
  const unmark = useUnmarkAttendance();
  const record = attendance?.find(
    (r) =>
      r.subject_id === slot.subject_id && r.date === date && r.start_time === slot.start_time
  );

  function toggle(status: AttendanceStatus) {
    haptic(isAttended(status) ? 10 : [8, 30, 8]);
    if (record?.status === status) {
      unmark.mutate({ subject_id: slot.subject_id, date, start_time: slot.start_time });
    } else {
      mark.mutate({
        subject_id: slot.subject_id,
        date,
        start_time: slot.start_time,
        end_time: slot.end_time,
        status,
      });
    }
  }

  const optionButtons = (
    <div className="flex shrink-0 gap-1.5">
      {OPTIONS.map((opt) => {
        const isActive = record?.status === opt.status;
        return (
          <motion.button
            key={opt.status}
            whileTap={{ scale: 0.88 }}
            onClick={() => toggle(opt.status)}
            aria-label={`${opt.label} - ${subject?.name ?? "class"}`}
            aria-pressed={isActive}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
              isActive ? opt.activeClass : "border bg-surface text-muted hover:text-ink"
            )}
          >
            <opt.icon className="h-4 w-4" strokeWidth={2.5} />
          </motion.button>
        );
      })}
    </div>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between gap-3 rounded-2xl border bg-surface-2/40 p-3"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Dot color={subject?.color_hex ?? "#888"} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{subject?.name ?? "Unknown subject"}</p>
          <p className="truncate text-xs font-medium text-muted">
            {extra ? "Extra · " : slot.slot_type === "lab" ? "Lab · " : ""}
            {formatTimeRange(slot.start_time, slot.end_time)}
            {slot.room ? ` · ${slot.room}` : ""}
          </p>
        </div>
      </div>

      {optionButtons}
    </motion.div>
  );
}
