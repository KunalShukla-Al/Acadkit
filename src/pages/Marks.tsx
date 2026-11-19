import { MarkHabitsCard } from "@/components/insights/habits-card";
import { useMemo, useState, type CSSProperties } from "react";
import { jumpTargetId } from "@/lib/jump";
import { motion } from "motion/react";
import { Plus, Target, TrendingUp } from "lucide-react";
import { ShareImageButton } from "@/components/share-image-button";
import { Badge, Dot, Skeleton } from "@/components/ui/misc";
import { SgpaDial } from "@/components/viz/sgpa-dial";
import { GradeBadge } from "@/components/viz/grade-badge";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { MarkSheet } from "@/components/sheets/mark-sheet";
import {
  useAttendance,
  useMarks,
  usePortalSnapshots,
  useSettings,
  useSubjects,
} from "@/hooks/useData";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { countsInSgpa, groupMarksBySubject } from "@acadkit/core/grades";
import { announcedPending, computeSgpa, floorMarks, floorTotal, canAddMarks, type SubjectOutlook } from "@acadkit/core/plan";
import { buildShareData, renderShareCard } from "@/lib/shareCard";
import { computeOverallAttendance } from "@acadkit/core/attendance";
import type { Mark, PlannedComponent, Subject } from "@acadkit/core/types";
import { Segmented } from "@/components/ui/segmented";
import { cn, haptic } from "@/lib/utils";
import { useSwipe } from "@/hooks/useSwipe";
import { slideTransition, slideVariants } from "@/lib/slide";
import { GradesProjection } from "@/components/insights/grades-projection";
import { useProjectionReport } from "@/hooks/useProjectionReport";

/** The semester as an image: predicted SGPA, attendance, and each subject's grade. */
function ShareButton({
  rows,
  sgpa,
}: {
  rows: Array<{ subject: Subject; marks: SubjectOutlook }>;
  sgpa: number | null;
}) {
  const { data: settings } = useSettings();
  const { data: attendance } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();

  async function render() {
    const overall = computeOverallAttendance(
      rows.map((r) => r.subject),
      attendance ?? [],
      snapshots ?? []
    );
    return renderShareCard(
      buildShareData({
        name: settings?.name,
        semester: settings?.semester,
        sgpa,
        attendancePct: overall.percentage,
        subjects: rows.map((r) => ({
          code: r.subject.code,
          grade: r.marks.grade,
          color: r.subject.color_hex,
          hasMarks: r.marks.hasAnyMarks,
        })),
      })
    );
  }

  return <ShareImageButton render={render} filename="acadkit-semester.png" />;
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <motion.div
        className="h-full rounded-full"
        style={{ backgroundColor: color }}
        initial={false}
        animate={{ width: `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }}
        transition={{ type: "spring", stiffness: 60, damping: 18 }}
      />
    </div>
  );
}

function SubjectMarksCard({
  subject,
  marks,
  onAdd,
  onEdit,
}: {
  subject: Subject;
  marks: SubjectOutlook;
  onAdd: (subject: Subject, announced?: PlannedComponent) => void;
  onEdit: (subject: Subject, mark: Mark) => void;
}) {
  const tone = useTone();
  const audit = !countsInSgpa(subject);
  // Announced in the plan, not marked yet. Shown so an announcement
  // made from here doesn't disappear into Settings.
  const pending = announcedPending(subject, marks.internalComponents);
  // Add marks is for weight with no tile of its own; an announced test fills in from its tile, and a
  // marked one still opens to edit.
  const addable = canAddMarks(subject, marks);
  const tiles = marks.internalComponents.length + pending.length + (addable ? 1 : 0);

  return (
    <motion.section layout id={jumpTargetId("marks", subject.id)} className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-start gap-2 font-bold">
            <Dot color={subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {subject.code} · {audit ? (subject.credits > 0 ? `${subject.credits} credits · non-graded (no SGPA)` : "audit (no SGPA)") : `${subject.credits} credits`}
            {subject.internal_only ? " · internals = /100" : ""}
          </p>
        </div>
        {marks.hasAnyMarks ? (
          <GradeBadge grade={marks.grade} />
        ) : (
          <Badge className="bg-surface-2 text-muted">no marks</Badge>
        )}
      </div>

      {/* Internals so far, raw, and the total they put you on pace for. */}
      <div className="mt-3">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs font-semibold">
          <span className="tabular">
            <span className="text-muted">Internals so far</span>{" "}
            <AnimatedNumber value={floorMarks(marks.internalObtained)} decimals={2} trim />
            <span className="text-muted"> / {marks.internalMax}</span>
          </span>
          {marks.hasAnyMarks ? (
            <span className="flex items-center gap-1 tabular">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
              <span className="text-muted">On pace</span>
              <AnimatedNumber value={floorTotal(marks.predictedTotal)} decimals={2} trim />
              <span className="text-muted">/ 100</span>
            </span>
          ) : (
            <span className="text-muted">{say(VOICE.noInternals, tone)}</span>
          )}
        </div>
        <Bar value={marks.internalObtained} max={marks.internalMax} color={subject.color_hex} />
      </div>

      {/* One tile per component. On a wide card they share one row; on a narrow
          one they split into even rows. Either way they stretch, so no row
          ends short. */}
      <div className="@container mt-3" style={{ "--per": tiles <= 4 ? tiles : Math.ceil(tiles / 2) } as CSSProperties}>
        <div className="flex flex-wrap gap-1.5">
          {marks.internalComponents.map((m) => (
            <button
              key={m.id}
              onClick={() => onEdit(subject, m)}
              className={cn(TILE, "border bg-surface-2/50 hover:bg-surface-2")}
            >
              <span className="text-[11px] font-semibold text-muted">{m.label}</span>
              <span className="tabular text-sm font-bold">
                {m.marks_obtained}
                <span className="text-xs font-semibold text-muted">/{m.max_marks}</span>
              </span>
              {/* How much of this one you took. */}
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-[3px]"
                style={{ width: `${m.max_marks > 0 ? Math.min(100, (m.marks_obtained / m.max_marks) * 100) : 0}%`, backgroundColor: subject.color_hex }}
              />
            </button>
          ))}
          {pending.map((c) => (
            <button
              key={c.key}
              onClick={() => onAdd(subject, c)}
              aria-label={`Enter marks for ${c.label}`}
              className={cn(TILE, "border border-dashed text-muted hover:bg-surface-2/50")}
            >
              <span className="text-[11px] font-semibold">{c.label}</span>
              <span className="tabular text-sm font-bold">–<span className="text-xs font-semibold">/{c.max}</span></span>
            </button>
          ))}
          {addable && (
            <button
              onClick={() => onAdd(subject)}
              className={cn(TILE, "items-center justify-center border border-dashed text-muted hover:bg-surface-2/50 hover:text-ink")}
            >
              <span className="flex items-center gap-1 text-xs font-semibold">
                <Plus className="h-3.5 w-3.5" /> Add marks
              </span>
            </button>
          )}
        </div>
      </div>
    </motion.section>
  );
}

/** A component tile: tappable, and it stretches with its row (see --per above). */
const TILE =
  "relative flex min-h-[3.25rem] min-w-[4.5rem] flex-1 basis-[calc(100%/var(--per)-0.5rem)] flex-col justify-center gap-0.5 overflow-hidden rounded-xl px-3 py-2 text-left transition-colors @[24rem]:basis-0";

export default function Marks() {
  return <MarksInner />;
}

function MarksInner() {
  const tone = useTone();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: marks, isLoading: mLoading } = useMarks();

  const [sheetSubject, setSheetSubject] = useState<Subject | null>(null);
  const [sheetMark, setSheetMark] = useState<Mark | null>(null);
  const [sheetAnnounced, setSheetAnnounced] = useState<PlannedComponent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  // What you've got, what each test still has to return, and what the
  // tests you're waiting on are likely to do to that. The last two were
  // the Grades tab on Insights.
  const [view, setView] = useState<"marks" | "targets">("marks");
  // A pane slides in when you switch to it; the first is just there.
  const [firstView] = useState(view);
  // Same order as the switch, so a swipe lands where the eye expects.
  // Ends are walls rather than wrapping, as on the other swipeable pages.
  const VIEWS = ["marks", "targets"] as const;
  const [dir, setDir] = useState(0);
  const goView = (next: (typeof VIEWS)[number]) => {
    setDir(VIEWS.indexOf(next) > VIEWS.indexOf(view) ? 1 : -1);
    setView(next);
  };
  const viewSwipe = useSwipe(
    () => {
      const next = VIEWS[VIEWS.indexOf(view) + 1];
      if (next) { haptic(); goView(next); }
    },
    () => {
      const next = VIEWS[VIEWS.indexOf(view) - 1];
      if (next) { haptic(); goView(next); }
    }
  );
  const { report } = useProjectionReport();

  const result = useMemo(
    () => computeSgpa(subjects ?? [], groupMarksBySubject(marks ?? [])),
    [subjects, marks]
  );

  if (sLoading || mLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="relative space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <h1 className="min-w-0 text-2xl font-extrabold tracking-tight lg:text-3xl">{say(VOICE.titleMarks, tone)}</h1>
        <ShareButton rows={result.rows} sgpa={result.sgpa} />
      </div>

      <Segmented
        layoutId="marks-view"
        options={[
          { value: "marks", label: "Marks" },
          { value: "targets", label: "Targets" },
        ]}
        value={view}
        onChange={goView}
        className="w-full sm:w-80"
      />


      <motion.div
        key={view}
        custom={dir}
        variants={slideVariants}
        initial={view !== firstView ? "enter" : false}
        animate="center"
        transition={slideTransition}
        className="space-y-4"
        data-swipe
        {...viewSwipe}
      >
      {view !== "marks" ? (
        <>
          <GradesProjection report={report} />
          <MarkHabitsCard />
        </>
      ) : (
      <>
      <div className="space-y-4">
            <section className="card flex flex-col items-center gap-4 p-6">
              <SgpaDial sgpa={result.sgpa} />
              <p className="flex items-center gap-2 text-sm font-semibold text-muted">
                <Target className="h-4 w-4" />
                {result.countedSubjects === 0 ? (
                  "Add internal marks to see your predicted SGPA"
                ) : (
                  <span>
                    Predicted from {result.countedSubjects} subject{result.countedSubjects > 1 ? "s" : ""} · {result.totalCredits} credits
                  </span>
                )}
              </p>
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* An audit course (no credits) has no marks to show; it goes last. */}
              {[...result.rows].sort((a, b) => Number(a.subject.credits === 0) - Number(b.subject.credits === 0)).map(({ subject, marks: m }) => (
                <SubjectMarksCard
                  key={subject.id}
                  subject={subject}
                  marks={m}
                  onAdd={(s, announced) => {
                    setSheetSubject(s);
                    setSheetMark(null);
                    setSheetAnnounced(announced ?? null);
                    setSheetOpen(true);
                  }}
                  onEdit={(s, mark) => {
                    setSheetSubject(s);
                    setSheetMark(mark);
                    setSheetAnnounced(null);
                    setSheetOpen(true);
                  }}
                />
              ))}
        </div>
      </div>
      </>
      )}
      </motion.div>

      <MarkSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        subject={sheetSubject}
        mark={sheetMark}
        announced={sheetAnnounced}
        existing={(marks ?? []).filter((m) => m.subject_id === sheetSubject?.id)}
      />
    </div>
  );
}
