import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Dot } from "@/components/ui/misc";
import { countdownLabel, examUrgency, nextMarked } from "@/lib/examCountdown";
import { deadlineNeed, describeNeed } from "@/lib/deadlineTarget";
import { deadlineLabel } from "@/lib/deadlines";
import { formatDate } from "@acadkit/core/dates";
import { testTitle } from "@acadkit/core/subjectShort";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { useListedDeadlines, useMarks, useSettings, useSubjects } from "@/hooks/useData";
import { cn } from "@/lib/utils";

/** A countdown to the next thing that carries marks, and the score that would move your grade. */
export function ExamCountdown() {
  const tone = useTone();
  const { data: deadlines } = useListedDeadlines();
  const { data: subjects } = useSubjects();
  const { data: marks } = useMarks();
  const { data: settings } = useSettings();

  // Ticks so the card lets go of an exam once it is over, without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = nextMarked(deadlines, now);
  if (!upcoming) return null;

  const { deadline, daysAway } = upcoming;
  const subject = subjects?.find((s) => s.id === deadline.subject_id);
  const urgency = examUrgency(daysAway);
  // Which test it is, with its subject: "DSA FT-III". A title that is only a course code says nothing, so the type stands in.
  const named = deadline.title.replace(/^\s*\d{2}[A-Z]{3}\d{3}[A-Z]\b\s*/, "").trim();
  const title = testTitle(named || deadlineLabel(deadline, null), subject);

  const need = subject
    ? deadlineNeed(
        deadline,
        subject,
        (marks ?? []).filter((m) => m.subject_id === deadline.subject_id),
        {
          deadlines: (deadlines ?? []).filter((d) => d.subject_id === deadline.subject_id),
          targetSgpa: settings?.target_sgpa ?? 8.5,
          assumedExternalPct: null,
        }
      )
    : null;
  const advice = need ? describeNeed(need) : null;

  return (
    <motion.section
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
      className={cn(
        "card relative overflow-hidden p-5",
        urgency === "imminent" && "ring-2 ring-bad/40",
        urgency === "near" && "ring-1 ring-warn/40"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
            {say(VOICE.examLabel, tone)}
          </p>
          <p className="mt-1 flex items-start gap-2 text-lg font-extrabold">
            {subject && <Dot color={subject.color_hex} className="mt-2 shrink-0" />}
            <span className="line-clamp-2">{title}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {formatDate(deadline.due_date.slice(0, 10), {
              weekday: "short",
              day: "numeric",
              month: "long",
            })}
            {` · out of ${deadline.max_marks}`}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p
            className={cn(
              "text-3xl font-extrabold leading-none tabular",
              urgency === "imminent" && "text-bad-deep",
              urgency === "near" && "text-warn-deep"
            )}
          >
            {countdownLabel(daysAway)}
          </p>
        </div>
      </div>

      {/* The whole reason the date was typed in: what to aim for. */}
      <div className="mt-4 border-t pt-3">
        {daysAway === 0 ? (
          <p className="text-sm font-bold">{say(VOICE.examToday, tone)}</p>
        ) : advice ? (
          <p className="text-sm font-bold text-accent">{advice}</p>
        ) : (
          // The subject has no marks to set a pace from, so the fix is in Marks.
          <Link
            to="/marks"
            className="flex items-center gap-1.5 text-sm font-semibold text-muted"
          >
            {say(VOICE.examNoPace, tone)}
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          </Link>
        )}
      </div>
    </motion.section>
  );
}
