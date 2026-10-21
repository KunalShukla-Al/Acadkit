import { useMemo } from "react";
import { motion } from "motion/react";
import { ChevronDown, GraduationCap, Target } from "lucide-react";
import { useDeadlines, useMarks, useSettings } from "@/hooks/useData";
import { useTone } from "@/hooks/useTone";
import { CgpaCard } from "@/components/insights/cgpa-card";
import { SubjectBudgetCard } from "@/components/insights/subject-budget";
import { EmptyState } from "@/components/ui/misc";
import { JumpPills } from "@/components/ui/jump-pills";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { expectedOutlook, realisedSgpa } from "@acadkit/core/expected";
import { countsInSgpa, groupMarksBySubject } from "@acadkit/core/grades";
import type { buildProjection } from "@acadkit/core/projections";
import { subjectShort } from "@acadkit/core/subjectShort";
import { todayISO } from "@acadkit/core/dates";
import { say, VOICE } from "@/lib/voice";

/** Everything grade-shaped, in one place: Marks → Targets. */

export function GradesProjection({ report }: { report: ReturnType<typeof buildProjection> }) {
  const tone = useTone();
  const { data: marks } = useMarks();
  const { data: deadlines } = useDeadlines();
  const { data: settings } = useSettings();
  const bySubject = useMemo(() => groupMarksBySubject(marks ?? []), [marks]);

  // One expected solve per subject, shared by its card and the headline,
  // so the grade in the headline is the one its card argues for.
  const items = useMemo(
    () =>
      report.gradeProjections.map((p) => ({
        p,
        o: expectedOutlook(p.subject, bySubject.get(p.subject.id) ?? [], p.targetGrade, {
          deadlines: deadlines ?? [],
          assumedExternalPct: settings?.assumed_external_pct ?? null,
          today: todayISO(),
        }),
      })),
    [report.gradeProjections, bySubject, deadlines, settings?.assumed_external_pct]
  );
  const graded = items.filter(({ p }) => countsInSgpa(p.subject));
  const ungraded = items.filter(({ p }) => !countsInSgpa(p.subject));
  const realised = useMemo(
    () =>
      realisedSgpa(
        items.map(({ p, o }) => ({ subject: p.subject, targetGrade: p.targetGrade, plan: o.plan, barred: p.eligibility.status === "barred" }))
      ),
    [items]
  );
  const gradeOf = new Map(realised.grades.map((g) => [g.subjectId, g]));

  if (report.gradeProjections.length === 0) {
    return (
      <section className="card">
        <EmptyState
          icon={GraduationCap}
          title={say(VOICE.insightsNeedMarks, tone)}
          description="Add your subjects and this backsolves what every remaining test and the end-sem have to return for the grade you're aiming at - re-spread after each result."
          className="py-10"
        />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* The semester if every subject below its target gets there. */}
      {realised.sgpa !== null && (
        <section className="card flex flex-col items-center gap-3 p-6">
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">
            <Target className="h-3 w-3" /> {say(VOICE.realisedTitle, tone)}
          </p>
          <p className="text-5xl font-extrabold tabular accent-gradient-text">
            <AnimatedNumber value={realised.sgpa} decimals={2} />
          </p>
          <JumpPills
            prefix="tgt"
            pills={graded.map(({ p }) => {
              const g = gradeOf.get(p.subject.id);
              return {
                id: p.subject.id,
                label: subjectShort(p.subject),
                color: p.subject.color_hex,
                detail: g?.grade ?? null,
                detailClass: g && g.grade !== p.targetGrade ? "text-warn-deep" : "text-muted",
              };
            })}
          />
        </section>
      )}

      <div className="space-y-3">
        {graded.map(({ p, o }) => (
          <SubjectBudgetCard key={p.subject.id} p={p} o={o} />
        ))}
      </div>

      {/* Pass/fail courses (UHV-II, Professional Ethics): no grade reaches the
          SGPA, so they're folded away - but their cards, expectations and
          all, are still one tap down. */}
      {ungraded.length > 0 && (
        <details className="group space-y-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-1 text-xs font-medium text-muted">
            <span>
              <b className="font-bold uppercase tracking-widest">Not graded</b> - pass or fail, not in your SGPA:{" "}
              {ungraded.map(({ p }) => p.subject.short_name?.trim() || p.subject.name).join(", ")}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          {ungraded.map(({ p, o }) => (
            <SubjectBudgetCard key={p.subject.id} p={p} o={o} />
          ))}
        </details>
      )}

      <motion.div
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
      >
        <CgpaCard />
      </motion.div>
    </div>
  );
}
