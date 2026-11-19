import { useMemo, useState } from "react";
import { JumpPills } from "@/components/ui/jump-pills";
import { jumpTargetId } from "@/lib/jump";
import { subjectShort } from "@acadkit/core/subjectShort";
import {
  AlertTriangle,
  GraduationCap,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Dot, EmptyState, Skeleton } from "@/components/ui/misc";
import { ProgressRing } from "@/components/viz/progress-ring";
import { AnimatedNumber } from "@/components/viz/animated-number";
import { AttendanceHeatmap } from "@/components/viz/heatmap";
import { BunkWallet } from "@/components/viz/bunk-wallet";
import { classesPerDayOrder, forecast, remainingDays } from "@/lib/forecast";
import {
  useAttendance,
  usePortalSnapshots,
  useSettings,
  useSubjects,
  useTimetable,
} from "@/hooks/useData";
import {
  attendanceColor,
  attendanceTextClass,
  computeOverallAttendance,
  type SubjectAttendance,
} from "@acadkit/core/attendance";
import { buildEffectiveMap, semesterWindow } from "@acadkit/core/calendar";
import { formatDate, relativeDay, todayISO } from "@acadkit/core/dates";
import { attendanceTrend, type SubjectProjection } from "@acadkit/core/projections";
import { syncHealth } from "@/lib/syncHealth";
import { ShareImageButton } from "@/components/share-image-button";
import { buildAttendanceShare, renderAttendanceCard } from "@/lib/shareCard";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { cn } from "@/lib/utils";
import { useProjectionReport } from "@/hooks/useProjectionReport";

function SubjectRow({
  stats,
  projected,
  jumpedAt,
}: {
  stats: SubjectAttendance;
  /** Its projection: classes left, and the day it gets back over 65 and 75. Null without a timetable. */
  projected: SubjectProjection | null;
  /** Set when a subject chip at the top jumped here: the row opens to show its detail. */
  jumpedAt?: number;
}) {
  const tone = useTone();
  const [open, setOpen] = useState(false);
  // A new jump opens the row (adjusted while rendering, not in an effect).
  const [seenJump, setSeenJump] = useState(jumpedAt);
  if (jumpedAt !== seenJump) {
    setSeenJump(jumpedAt);
    if (jumpedAt) setOpen(true);
  }
  const pct = stats.percentage;
  const canOpen = stats.total > 0;
  const counts: Array<[string, number | string]> = [
    ["Total", stats.total],
    ["Attended", stats.attended],
    ["Absent", stats.total - stats.attended],
    ["Left", projected?.remaining ?? "—"],
  ];

  return (
    <div id={jumpTargetId("att", stats.subject.id)} className="card overflow-hidden">
      <button
        className="flex w-full items-center gap-4 p-4 text-left"
        onClick={() => canOpen && setOpen((v) => !v)}
        aria-expanded={canOpen ? open : undefined}
      >
        <ProgressRing value={pct ?? 0} size={56} strokeWidth={6} color={attendanceColor(pct)}>
          <span className={cn("text-xs font-extrabold tabular", attendanceTextClass(pct))}>
            {pct === null ? "—" : `${Math.round(pct)}`}
          </span>
        </ProgressRing>

        <div className="min-w-0 flex-1">
          <p className="flex items-start gap-2 font-bold">
            <Dot color={stats.subject.color_hex} className="mt-1.5 shrink-0" />
            <span className="line-clamp-2">{stats.subject.name}</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-muted">
            {stats.total === 0
              ? say(VOICE.noClassesMarked, tone)
              : say(VOICE.hoursWasted, tone, stats.attended, stats.total)}
          </p>
          {/* Under 65 or 75, the day each comes back by attending every class; gone once it's over both. */}
          {projected && projected.climbs.length > 0 && (
            <p className="mt-1 text-xs font-bold tabular">
              {projected.climbs.map((c, i) => (
                <span key={c.bar} className={c.date ? "text-warn-deep" : "text-bad-deep"}>
                  {i > 0 && <span className="text-muted"> · </span>}
                  {c.bar}% {c.date ? `by ${formatDate(c.date)}` : "out of reach"}
                </span>
              ))}
            </p>
          )}
        </div>
      </button>

      {/* Opens by its rows, 0fr to 1fr, which the browser eases without measuring the
          content, so the card grows smoothly and the rows below follow it. */}
      {canOpen && (
        <div
          inert={!open}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <dl className="grid grid-cols-4 divide-x border-t">
              {counts.map(([label, value]) => (
                <div key={label} className="flex flex-col-reverse items-center px-2 py-3">
                  <dt className="text-[11px] font-semibold text-muted">{label}</dt>
                  <dd className="text-lg font-extrabold tabular">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Attendance() {
  return <AttendanceInner />;
}

function AttendanceInner() {
  // Which subject a chip at the top last jumped to (and when, so the same chip twice re-opens it).
  const [jumped, setJumped] = useState<{ id: string; at: number } | null>(null);
  const tone = useTone();
  const { data: subjects, isLoading: sLoading } = useSubjects();
  const { data: attendance, isLoading: aLoading } = useAttendance();
  const { data: snapshots } = usePortalSnapshots();
  const { data: settings } = useSettings();
  const { data: timetable } = useTimetable();
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  const projection = useProjectionReport();

  const overall = useMemo(
    () => computeOverallAttendance(subjects ?? [], attendance ?? [], snapshots ?? []),
    [subjects, attendance, snapshots]
  );

  // Each subject's projection, for its row; none without a timetable to count classes from.
  const projected = useMemo(
    () =>
      projection.timetable.length === 0
        ? null
        : new Map(projection.report.perSubject.map((p) => [p.subject.id, p])),
    [projection.timetable.length, projection.report]
  );
  // Depend on the two fields, not the settings object: React Query
  // hands back a new object on every refetch, so listing `settings`
  // would satisfy the linter by defeating the memo.
  const semStart = settings?.sem_start ?? null;
  const semEnd = settings?.sem_end ?? null;
  const semWindow = useMemo(
    () => semesterWindow({ sem_start: semStart, sem_end: semEnd }),
    [semStart, semEnd]
  );
  // Working days only, declared holidays already shifted out - the
  // heatmap draws the days that actually happened, in sequence.
  const health = useMemo(() => syncHealth(snapshots ?? []), [snapshots]);
  // Which way the number is moving. Insights has said this all along,
  // two taps away; it belongs beside the number it describes.
  const trend = useMemo(() => attendanceTrend(attendance ?? []), [attendance]);
  const effMap = useMemo(
    () => buildEffectiveMap(settings?.declared_holidays ?? [], semWindow),
    [settings?.declared_holidays, semWindow]
  );

  // The rest of the semester, each day carrying its day order's class
  // count - what a pencilled-in skip actually costs.
  const future = useMemo(
    () => remainingDays(effMap, classesPerDayOrder(timetable), todayISO()),
    [effMap, timetable]
  );
  const plan = useMemo(
    () => forecast(overall.attended, overall.total, future, skipped),
    [overall.attended, overall.total, future, skipped]
  );
  const toggleSkip = (date: string) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (!next.delete(date)) next.add(date);
      return next;
    });

  if (sLoading || aLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const pct = overall.percentage;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">
              {say(VOICE.titleAttendance, tone)}
            </h1>
          </div>
          {overall.portalAsOf && health.state !== "stale" && (
            <p className="mt-0.5 text-[11px] font-medium text-muted">
              Synced {relativeDay(overall.portalAsOf)}
            </p>
          )}
          {/* Silent staleness is the failure mode: the sync writes with no
              announcement, so a broken job looks exactly like a quiet
              week. Only shouts once the numbers are actually suspect. */}
          {health.state === "stale" && health.days !== null && (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-warn-deep">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {say(VOICE.syncStale, tone, health.days)}
            </p>
          )}
          {health.state === "never" && (
            <p className="mt-1 text-xs font-semibold text-muted">
              {say(VOICE.syncNever, tone)}
            </p>
          )}
        </div>
        {/* Attendance as an image, as Marks shares the semester's grades. */}
        <ShareImageButton
          filename="acadkit-attendance.png"
          render={() =>
            renderAttendanceCard(
              buildAttendanceShare({
                name: settings?.name,
                semester: settings?.semester,
                attended: overall.attended,
                total: overall.total,
                percentage: overall.percentage,
                subjects: overall.subjects.map((s) => ({
                  label: subjectShort(s.subject),
                  color: s.subject.color_hex,
                  percentage: s.percentage,
                  min: s.min,
                })),
              })
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="card flex flex-col items-center p-6 lg:col-span-2">
          <ProgressRing
            value={pct ?? 0}
            size={190}
            strokeWidth={16}
            sweep={270}
            color={attendanceColor(pct)}
          >
            <div className="flex flex-col items-center">
              {pct === null ? (
                <span className="text-2xl font-extrabold text-muted">—</span>
              ) : (
                <span className={cn("text-5xl font-extrabold tabular", attendanceTextClass(pct))}>
                  <AnimatedNumber value={pct} decimals={0} />
                  <span className="text-2xl">%</span>
                </span>
              )}
              <span className="mt-1 text-xs font-bold uppercase tracking-widest text-muted">
                overall
              </span>
            </div>
          </ProgressRing>
          <p className="mt-2 text-center text-sm font-semibold text-muted">
            {pct === null
              ? "Mark your first class to see stats"
              : `${overall.attended} attended · ${overall.total - overall.attended} missed · ${
                  overall.subjects.length && overall.subjects.every((s) => s.min < 75) ? "65% required (medical leave)" : "75% required"
                }`}
          </p>

          {/* A percentage says where you are; the direction says where
              you're going, which is the half that changes behaviour. */}
          {trend !== "insufficient" && (
            <p
              className={cn(
                "mt-2 flex items-center gap-1.5 text-xs font-bold",
                trend === "improving" && "text-good-deep",
                trend === "declining" && "text-bad-deep",
                trend === "steady" && "text-muted"
              )}
            >
              {trend === "declining" ? (
                <TrendingDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              )}
              {say(
                trend === "improving"
                  ? VOICE.trendImproving
                  : trend === "declining"
                    ? VOICE.trendDeclining
                    : VOICE.trendSteady,
                tone
              )}
            </p>
          )}

          <JumpPills
            prefix="att"
            pills={overall.subjects.map((s) => ({
              id: s.subject.id,
              label: subjectShort(s.subject),
              color: s.subject.color_hex,
              detail: s.percentage === null ? null : `${Math.round(s.percentage)}%`,
              detailClass: attendanceTextClass(s.percentage),
            }))}
            onJump={(id) => setJumped({ id, at: Date.now() })}
            className="mt-4"
          />
        </section>

        {/* Heatmap */}
        <section className="card p-5 lg:col-span-3">
          <p className="mb-4 text-xs font-bold uppercase tracking-widest text-muted">
            Semester heatmap
          </p>
          {overall.total === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title={say(VOICE.heatmapEmptyTitle, tone)}
              description={say(VOICE.heatmapEmptyBody, tone)}
              className="py-6"
            />
          ) : (
            <>
              <AttendanceHeatmap
                records={attendance ?? []}
                effMap={effMap}
                future={future}
                skipped={skipped}
                onToggleSkip={toggleSkip}
              />

              {/* What the days you've pencilled in as skips would cost, once there are some. */}
              {plan.baseline !== null && skipped.size > 0 && (
                <div className="mt-4 border-t pt-3">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-muted">
                        {say(VOICE.forecastSelected, tone, skipped.size, plan.classesSkipped)}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-2xl font-extrabold tabular",
                          attendanceTextClass(plan.projected)
                        )}
                      >
                        {plan.projected!.toFixed(1)}%
                        <span className="ml-2 text-sm font-bold text-muted">
                          {plan.delta.toFixed(1)}
                        </span>
                      </p>
                      {plan.belowMinimum && (
                        <p className="mt-0.5 text-xs font-bold text-bad-deep">
                          {say(VOICE.forecastBelow, tone)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setSkipped(new Set())}
                      className="shrink-0 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Per subject, then the wallet. */}
      <div className="space-y-3">
        <p className="px-1 text-xs font-bold uppercase tracking-widest text-muted">By subject</p>
        {overall.subjects.map((s) => (
          <SubjectRow
            key={s.subject.id}
            stats={s}
            projected={projected?.get(s.subject.id) ?? null}
            jumpedAt={jumped?.id === s.subject.id ? jumped.at : undefined}
          />
        ))}
      </div>

      <BunkWallet stats={overall.subjects} />

    </div>
  );
}
