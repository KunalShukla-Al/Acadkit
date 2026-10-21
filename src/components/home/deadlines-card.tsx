import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Dot, Skeleton } from "@/components/ui/misc";
import { DeadlineSheet } from "@/components/sheets/deadline-sheet";
import { useListedDeadlines, useMarks, useSettings, useSubjects, useUpdateDeadline } from "@/hooks/useData";
import { deadlineLabel, upcomingDeadlines } from "@/lib/deadlines";
import { deadlineNeed, describeNeed } from "@/lib/deadlineTarget";
import { say, VOICE } from "@/lib/voice";
import { useTone } from "@/hooks/useTone";
import { diffDays, istParts } from "@acadkit/core/dates";
import { cn, haptic } from "@/lib/utils";
import type { Deadline } from "@acadkit/core/types";

/**
 * What's due, soonest first, with what each needs of you; add, tick off or
 * edit them here. `preview` is Today's: the next three, each opening the
 * Deadlines page.
 */
export function DeadlinesCard({ preview = false }: { preview?: boolean }) {
  const tone = useTone();
  const { data: marks } = useMarks();
  const { data: deadlines, isLoading } = useListedDeadlines();
  const { data: subjects } = useSubjects();
  const { data: settings } = useSettings();
  const updateDeadline = useUpdateDeadline();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Deadline | null>(null);

  // Ticks, so a deadline passing while the app is open (or resumed from
  // the background) leaves the list without waiting for a refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  // Five on the page; the header (or the button under the list) opens the rest in place.
  const [showAll, setShowAll] = useState(false);
  const allUpcoming = useMemo(() => upcomingDeadlines(deadlines, now, Infinity), [deadlines, now]);
  const upcoming = preview ? allUpcoming.slice(0, 3) : showAll ? allUpcoming : allUpcoming.slice(0, 5);
  // Days by the calendar in IST: a test at 2 PM is today all morning, not tomorrow.
  const todayIst = istParts(new Date(now).toISOString()).date;
  const hidden = allUpcoming.length - upcoming.length;

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <section className="card p-5">
      {preview ? (
        <Link to="/deadlines" className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted hover:text-ink">
          Deadlines
          <span className="flex items-center gap-1 normal-case tracking-normal text-accent-deep">
            All <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="text-left text-xs font-bold uppercase tracking-widest text-muted"
          >
            Upcoming deadlines{allUpcoming.length > 5 ? ` · ${allUpcoming.length}` : ""}
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditing(null);
              setSheetOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      )}

      {upcoming.length === 0 ? (
        // A full empty state - icon, heading, paragraph - is a lot of dashboard for "you have no deadlines", which is the steady state for most people.
        <p className="px-1 pb-1 text-sm font-semibold text-muted">
          {say(VOICE.deadlinesEmptyTitle, tone)}
        </p>
      ) : (
        <div className="space-y-2">
          {upcoming.map((d) => {
            const subject = subjects?.find((s) => s.id === d.subject_id);
            // The same number the subject's Insights card shows for
            // this test, against the grade you set there.
            const need =
              d.max_marks && subject
                ? deadlineNeed(
                    d,
                    subject,
                    (marks ?? []).filter((m) => m.subject_id === d.subject_id),
                    {
                      deadlines: (deadlines ?? []).filter((x) => x.subject_id === d.subject_id),
                      targetSgpa: settings?.target_sgpa ?? 8.5,
                      assumedExternalPct: settings?.assumed_external_pct ?? null,
                    }
                  )
                : null;
            const target = need ? describeNeed(need) : null;
            const days = diffDays(todayIst, istParts(d.due_date).date);
            const urgent = days <= 2;
            return (
              <motion.div
                key={d.id}
                className="flex items-center gap-3 rounded-2xl border bg-surface-2/40 p-3"
              >
                {/* The ring stays 24px; the button around it is 40, so the thing you tap is finger-sized without the row growing a hole in the middle of it. -m-2 pulls the extra padding back out of the layout. */}
                <button
                  aria-label={`Mark ${deadlineLabel(d, subject)} done`}
                  onClick={() => {
                    haptic([10, 40, 14]);
                    updateDeadline.mutate({ id: d.id, patch: { status: "done" } });
                  }}
                  className="group -m-2 flex shrink-0 items-center justify-center p-2"
                >
                  <span className="block h-6 w-6 rounded-full border-2 border-ink/20 transition-colors group-hover:border-good group-hover:bg-good/15" />
                </button>
                <RowBody
                  to={preview ? "/deadlines" : null}
                  onClick={() => {
                    setEditing(d);
                    setSheetOpen(true);
                  }}
                >
                  <p className="flex items-start gap-1.5 text-sm font-bold">
                    {subject && (
                      <Dot color={subject.color_hex} className="mt-[7px] h-1.5 w-1.5 shrink-0" />
                    )}
                    <span className="line-clamp-2">{deadlineLabel(d, subject)}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    <span className={cn(urgent && "font-bold text-bad-deep")}>
                      {days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}
                    </span>
                    {target && (
                      <>
                        <span aria-hidden>·</span>
                        {/* The whole point of adding a deadline: what to
                            aim for, not just when it lands. */}
                        <span className="truncate font-bold text-accent">{target}</span>
                      </>
                    )}
                  </p>
                </RowBody>
                <Badge
                  className={cn(
                    d.type === "exam" ? "bg-bad/10 text-bad-deep" : "bg-accent/10 text-accent-deep"
                  )}
                >
                  {d.type}
                </Badge>
              </motion.div>
            );
          })}
        </div>
      )}

      {!preview && (hidden > 0 || showAll) && allUpcoming.length > 5 && (
        <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${allUpcoming.length} deadlines`}
        </Button>
      )}

      <DeadlineSheet open={sheetOpen} onClose={() => setSheetOpen(false)} deadline={editing} />
    </section>
  );
}

/** A deadline's name and date: a link to the Deadlines page in Today's preview, else what opens its sheet. */
function RowBody({ to, onClick, children }: { to: string | null; onClick: () => void; children: React.ReactNode }) {
  const className = "min-w-0 flex-1 text-left";
  return to ? (
    <Link to={to} className={className}>
      {children}
    </Link>
  ) : (
    <button className={className} onClick={onClick}>
      {children}
    </button>
  );
}
