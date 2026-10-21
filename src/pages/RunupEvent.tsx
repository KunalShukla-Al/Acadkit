import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, BookOpen, FileText, Lightbulb, ListChecks, ScrollText } from "lucide-react";
import { TaskRow } from "@/components/runup/task-row";
import { caption, SubjectTag } from "@/components/runup/shared";
import { eventWhen, useSubjectByCode } from "@/components/runup/lookup";
import { FileRow } from "@/components/study/file-row";
import { UnitList } from "@/components/study/unit-list";
import { Segmented } from "@/components/ui/segmented";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { fetchUnits } from "@/api/units";
import { usePin, useSetPlanTick } from "@/hooks/useData";
import { useEventPyqs, useRunup, useTodayISO } from "@/hooks/useRunup";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import {
  eventById,
  eventProgress,
  eventTasks,
  materialsFor,
  pyqGroups,
  pyqUnits,
  topicCounts,
  type RunupEvent as Event,
  type RunupPyq,
} from "@/lib/runup";
import { viewerHref } from "@/lib/viewer";
import { cn } from "@/lib/utils";

type Tab = "plan" | "pyqs" | "units" | "files";

const squash = (s: string) => s.replace(/\s/g, "").toUpperCase();

/**
 * One test, review or end-sem: the target, how it's marked and how to
 * score, the past papers' questions, the syllabus units it covers, and
 * everything in the study folder to read for it. Tabs on the phone; on
 * the Mac it's all on one page in two columns.
 */
export default function RunupEvent() {
  const { id } = useParams();
  const pin = usePin();
  const today = useTodayISO();
  const { plan, done, files } = useRunup();
  const tick = useSetPlanTick();
  const subjectByCode = useSubjectByCode();
  const units = useQuery({ queryKey: ["units", pin], queryFn: () => fetchUnits(pin), staleTime: 5 * 60_000 });
  const [tab, setTab] = useState<Tab>("plan");
  const [unit, setUnit] = useState<number | null>(null);

  const event = plan.data ? eventById(plan.data, id) : null;
  const materials = useMemo(() => (event ? materialsFor(event, files) : []), [event, files]);
  const { pyqs, isLoading: pyqsLoading } = useEventPyqs(event);

  if (plan.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!plan.data) return <Navigate to="/runup" replace />;
  if (!event) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Not in the plan any more"
        description="This test was taken out of the run-up at the last sync."
        action={
          <Link to="/runup" className="font-bold text-accent-deep">
            Back to the run-up
          </Link>
        }
      />
    );
  }

  const data = plan.data;
  const subject = subjectByCode(event.subject_code);
  const progress = eventProgress(data, event.id, done);
  const tasks = eventTasks(data, event.id, done);
  const course = event.subject_code ? (units.data?.courses[squash(event.subject_code)] ?? null) : null;
  const onToggle = (task_id: string, isDone: boolean) => tick.mutate({ task_id, done: isDone });
  const show = (t: Tab) => cn(tab !== t && "hidden lg:block");

  return (
    <div className="space-y-4">
      <Link to={event.date ? `/runup/${event.date}` : "/runup"} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Run-up
      </Link>

      <header className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SubjectTag subject={subject} />
          <span className="text-xs font-semibold text-muted">{eventWhen(event, today)}</span>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">{event.title}</h1>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          {event.target && (
            <div>
              <p className={caption}>Your target</p>
              <p className="text-4xl font-extrabold tabular leading-none text-accent-deep">
                {event.target.score}
                <span className="text-xl text-muted"> / {event.target.max}</span>
              </p>
              {event.target.note && <p className="mt-1 text-xs font-medium text-muted">{event.target.note}</p>}
            </div>
          )}
          {event.weight && (
            <div>
              <p className={caption}>Counts for</p>
              <p className="text-sm font-bold">{event.weight}</p>
            </div>
          )}
          {progress.total > 0 && (
            <div className="min-w-40 flex-1">
              <p className={caption}>
                Prep · {progress.done}/{progress.total} tasks
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full bg-good transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </header>

      <Segmented
        className="lg:hidden"
        layoutId="runup-event-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "plan", label: "Plan" },
          { value: "pyqs", label: event.pyqCount ? `PYQs ${event.pyqCount}` : "PYQs" },
          { value: "units", label: "Units" },
          { value: "files", label: materials.length ? `Files ${materials.length}` : "Files" },
        ]}
      />

      <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <div className="space-y-4">
          <div className={cn("space-y-4", show("plan"))}>
            <PlanSection event={event} pyqs={pyqs} />
            {tasks.length > 0 && (
              <Section icon={ListChecks} title="Tasks for it">
                <ul className="-mx-4 divide-y">
                  {tasks.map((item) => (
                    <TaskRow key={item.task.id} item={item} plan={data} onToggle={onToggle} showFrom showEvent={false} />
                  ))}
                </ul>
              </Section>
            )}
          </div>
          <div className={show("units")}>
            <Section icon={BookOpen} title={event.units.length ? `Units ${event.units.join(", ")}: topics` : "Portion"}>
              {course && event.units.length > 0 ? (
                <UnitList course={course} only={event.units} className="-mx-4" />
              ) : event.portion.length ? (
                <List items={event.portion} />
              ) : (
                <p className="text-sm text-muted">The syllabus units come with the next sync.</p>
              )}
              {course && event.portion.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className={caption}>What's in it</p>
                  <List items={event.portion} className="mt-1.5" />
                </div>
              )}
            </Section>
          </div>
        </div>

        <div className="mt-4 space-y-4 lg:mt-0">
          <div className={show("pyqs")}>
            <PyqSection count={event.pyqCount} pyqs={pyqs} loading={pyqsLoading} unit={unit} onUnit={setUnit} />
          </div>
          <div className={show("files")}>
            <Section icon={FileText} title="Study material">
              {materials.length ? (
                <ul className="-mx-4 divide-y">
                  {materials.map((m) => (
                    <li key={m.file.path}>
                      <FileRow file={m.file} showFolder note={m.why ?? (m.picked ? undefined : m.file.unit ? `Unit ${m.file.unit}` : undefined)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nothing in the study folder is tagged for these units yet.</p>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof BookOpen; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
        <Icon className="h-4 w-4 text-accent" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((t, i) => (
        <li key={i} className="flex gap-2 text-sm leading-snug">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanSection({ event, pyqs }: { event: Event; pyqs: RunupPyq[] }) {
  const counts = topicCounts(pyqs, 8);
  return (
    <>
      {(event.format || event.scoring.length > 0) && (
        <Section icon={Lightbulb} title="How to score">
          {event.format && (
            <p className="mb-3 rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
              <span className="font-bold">Format: </span>
              {event.format}
            </p>
          )}
          <List items={event.scoring} />
        </Section>
      )}
      {event.prepare.length > 0 && (
        <Section icon={ListChecks} title="Prepare">
          <List items={event.prepare} />
        </Section>
      )}
      {(event.analysis || counts.length > 0) && (
        <Section icon={BarChart3} title="What past papers ask">
          {event.analysis ? (
            <>
              <ul className="space-y-2">
                {event.analysis.items.map((a, i) => (
                  <li key={i} className="text-sm">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 font-semibold">{a.topic}</span>
                      {a.seen && <span className="shrink-0 text-xs font-bold text-accent-deep tabular">{a.seen}</span>}
                    </span>
                    {a.note && <span className="block text-xs text-muted">{a.note}</span>}
                  </li>
                ))}
              </ul>
              {event.analysis.source && <p className="mt-3 text-[11px] text-muted">{event.analysis.source}</p>}
            </>
          ) : (
            <p className="mb-2 text-sm text-muted">No hand-made analysis for this one; here's what its past-paper questions cover.</p>
          )}
          {counts.length > 0 && (
            <div className={cn(event.analysis && "mt-3 border-t pt-3")}>
              <p className={caption}>Most asked, in the questions listed here</p>
              <ul className="mt-1.5 space-y-1">
                {counts.map((c) => (
                  <li key={c.topic} className="flex items-baseline gap-2 text-xs">
                    <span className="min-w-0 flex-1">{c.topic}</span>
                    <span className="shrink-0 font-bold tabular">×{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

function PyqSection({
  count,
  pyqs,
  loading,
  unit,
  onUnit,
}: {
  count: number;
  pyqs: RunupPyq[];
  loading: boolean;
  unit: number | null;
  onUnit: (u: number | null) => void;
}) {
  const viewerState = useViewerLinkState();
  const units = pyqUnits(pyqs);
  const groups = pyqGroups(pyqs, unit);
  return (
    <Section icon={ScrollText} title={`Past-paper questions · ${count}`}>
      {count === 0 ? (
        <p className="text-sm text-muted">No past paper of this kind is in the folder yet.</p>
      ) : loading ? (
        <Skeleton className="h-40 w-full" />
      ) : pyqs.length === 0 ? (
        <p className="text-sm text-muted">Couldn't load the questions. Check your connection and open this page again.</p>
      ) : (
        <>
          {units.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by unit">
              {[null, ...units].map((u) => (
                <button
                  key={u ?? "all"}
                  type="button"
                  aria-pressed={unit === u}
                  onClick={() => onUnit(u)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                    unit === u ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted hover:text-ink"
                  )}
                >
                  {u === null ? "All" : `Unit ${u}`}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.source}>
                <div className="mb-1.5 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-bold">{g.source}</p>
                  {g.file && (
                    <Link to={viewerHref(g.file, g.questions[0]?.page ?? null)} state={viewerState} className="shrink-0 text-xs font-bold text-accent-deep hover:underline">
                      Open paper
                    </Link>
                  )}
                </div>
                <ol className="space-y-2">
                  {g.questions.map((q, i) => (
                    <li key={i} className="rounded-xl bg-surface-2/50 px-3 py-2 text-sm leading-snug">
                      <span className="mb-0.5 flex flex-wrap gap-x-2 text-[11px] font-bold text-muted">
                        {q.number && <span>Q{q.number}</span>}
                        {q.marks !== null && <span>{q.marks} marks</span>}
                        {q.unit !== null && <span>Unit {q.unit}</span>}
                        {q.topic && <span className="font-medium">· {q.topic}</span>}
                      </span>
                      <span className="whitespace-pre-line">{q.text}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}
