import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, FileText, Target } from "lucide-react";
import { CoursePills, Pills } from "@/components/desk/course-pills";
import { DeskEmpty, DeskLoading } from "@/components/desk/states";
import { Segmented } from "@/components/ui/segmented";
import { useDeskCourse, useDeskIndex } from "@/hooks/useDesk";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { countdown, KIND_LABEL, testDay, type DeskCourse, type DeskTest, type DeskUnit } from "@/lib/desk";
import { viewerHref } from "@/lib/viewer";
import { cn } from "@/lib/utils";

const caption = "text-[11px] font-bold uppercase tracking-widest text-muted";
const pct = (n: number | undefined | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

/**
 * What to study first, from the past papers: per test, the lock-in by
 * position, topics ranked by expected marks and the smallest set that covers
 * most of a paper; per unit, every question asked, grouped by topic.
 */
export default function Priorities() {
  const [params, setParams] = useSearchParams();
  const { index, courses, today } = useDeskIndex();
  const entry = courses.find((c) => c.key === params.get("course")) ?? courses[0] ?? null;
  const course = useDeskCourse(entry);
  const view = params.get("view") === "unit" ? "unit" : "test";
  const set = (k: string, v: string | null) =>
    setParams((p) => {
      if (v == null) p.delete(k);
      else p.set(k, v);
      return p;
    }, { replace: true });

  if (index.isLoading || (entry && course.isLoading)) return <DeskLoading />;
  if (!entry || !course.data) return <DeskEmpty error={index.isError || course.isError} />;
  const c = course.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <CoursePills
        courses={courses}
        value={entry.key}
        onChange={(k) => setParams({ course: k, ...(view === "unit" ? { view } : {}) }, { replace: true })}
      />
      {/* On a phone the course takes its own line, so its name is never cut short. */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p className="wrap-break-word text-sm font-bold">{c.name}</p>
          <p className="text-xs font-medium text-muted">
            {c.code}
            {c.endsems ? ` · ${c.endsems} end-sem papers` : ""}
          </p>
        </div>
        <Segmented
          options={[
            { value: "test", label: "By test" },
            { value: "unit", label: "By unit" },
          ]}
          value={view}
          onChange={(v) => set("view", v === "unit" ? "unit" : null)}
          layoutId="desk-priorities-view"
          size="sm"
          className="w-full sm:w-56"
        />
      </div>
      <Reports course={c} />
      {view === "test" ? (
        <ByTest course={c} today={today} picked={params.get("test")} onPick={(id) => set("test", id)} />
      ) : (
        <ByUnit course={c} picked={Number(params.get("unit")) || null} onPick={(n) => set("unit", String(n))} />
      )}
    </div>
  );
}

/** The course's Prediction Checks and Repeats PDFs, on their first page. */
function Reports({ course }: { course: DeskCourse }) {
  const state = useViewerLinkState();
  const links = [
    course.reports.predict && { label: "Prediction checks", path: course.reports.predict },
    course.reports.repeats && { label: "Repeats by position", path: course.reports.repeats },
    course.reports.masterList && { label: "Video list", path: course.reports.masterList },
  ].filter(Boolean) as { label: string; path: string }[];
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2 px-1">
      {links.map((l) => (
        <Link key={l.path} to={viewerHref(l.path)} state={state} className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold hover:bg-surface-2/70">
          <FileText className="h-3.5 w-3.5 text-accent" /> {l.label}
        </Link>
      ))}
    </div>
  );
}

function ByTest({ course, today, picked, onPick }: { course: DeskCourse; today: string; picked: string | null; onPick: (id: string) => void }) {
  const tests = course.tests;
  if (!tests.length) return <p className="px-1 text-sm text-muted">No tests listed for this course yet.</p>;
  const test = tests.find((t) => t.id === picked) ?? tests.find((t) => (t.end ?? t.date ?? t.start ?? "9999") >= today) ?? tests[0];
  const endSem = /end/i.test(test.id) || /end-sem/i.test(test.name);
  return (
    <div className="space-y-4">
      <div className="px-1">
        <Pills options={tests.map((t) => ({ value: t.id, label: t.name }))} value={test.id} onChange={onPick} label="Test" />
      </div>
      <TestHead test={test} today={today} />
      {endSem && course.lockin.length > 0 && <LockIn course={course} />}
      <Ranked course={course} test={test} />
      {test.steps.length > 0 && <SmallestSet test={test} />}
      {course.backtest && (
        <p className="px-1 text-xs font-medium text-muted">
          Back-test: with each past paper hidden and topics ranked from the older ones, the top quarter covered {pct(course.backtest.recent)} of
          its marks ({pct(course.backtest.count)} by plain counts), against {pct(course.backtest.random)} for a random quarter.
        </p>
      )}
    </div>
  );
}

function TestHead({ test, today }: { test: DeskTest; today: string }) {
  const day = testDay(test);
  return (
    <section className="card space-y-1 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h2 className="min-w-0 flex-1 text-base font-extrabold">{test.name}</h2>
        {day && <span className="shrink-0 text-xs font-bold text-accent-deep tabular">{countdown(day, today)}</span>}
      </div>
      <p className="text-xs font-medium text-muted">
        {test.when ?? (day ? day : "Date not set")}
        {test.units.length ? ` · unit${test.units.length > 1 ? "s" : ""} ${test.units.join(", ")}` : ""}
        {test.weight ? ` · ${test.weight}% of the grade` : ""}
        {test.provisional && day ? " · window, not yet the exact day" : ""}
      </p>
      {test.note && <p className="text-xs font-medium text-muted">{test.note}</p>}
    </section>
  );
}

/** Each end-sem position and what it has asked, most often first: a long run of one topic is close to certain. */
function LockIn({ course }: { course: DeskCourse }) {
  return (
    <section className="card overflow-hidden p-0" aria-label="Lock-in by position">
      <p className={cn(caption, "px-4 pt-3")}>Lock-in by position</p>
      <ul className="divide-y">
        {course.lockin.map((l) => (
          <li key={l.slot} className="flex gap-3 px-4 py-2.5">
            <span className="w-14 shrink-0 text-sm font-extrabold tabular">{l.slot}</span>
            <span className="min-w-0 flex-1 space-y-0.5">
              {l.chain.map((step, i) => (
                <span key={i} className="block text-sm leading-snug">
                  {step.names.join(" or ")}{" "}
                  <span className="text-xs font-bold text-muted tabular">
                    {step.count}/{course.endsems ?? "?"}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TIER_TONE: Record<string, string> = {
  "near-certain": "bg-good/15 text-good-deep",
  likely: "bg-accent/15 text-accent-deep",
  possible: "bg-surface-2 text-muted",
};

function Ranked({ course, test }: { course: DeskCourse; test: DeskTest }) {
  if (!test.rows.length) return null;
  return (
    <section className="card overflow-hidden p-0" aria-label="Topics by expected marks">
      <p className={cn(caption, "flex items-center gap-1.5 px-4 pt-3")}>
        <Target className="h-3.5 w-3.5" /> Topics by expected marks
      </p>
      <ol className="divide-y">
        {test.rows.map((r) => (
          <li key={r.topic}>
            <Link to={`/desk/practice?course=${course.key}&topic=${encodeURIComponent(r.topic)}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{r.name}</span>
                <span className="block text-xs font-medium text-muted">
                  {r.unit ? `Unit ${r.unit} · ` : ""}asked in {r.seen} of {r.of} papers
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-extrabold tabular">{r.exp.toFixed(1)}</span>
                <span className={cn("mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold", TIER_TONE[r.tier] ?? TIER_TONE.possible)}>{r.tier}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="border-t px-4 py-2 text-[11px] font-medium text-muted">Expected marks per paper, from how often and how heavily each topic was asked.</p>
    </section>
  );
}

/** The fewest topics that cover most of a paper, in the order to learn them. */
function SmallestSet({ test }: { test: DeskTest }) {
  return (
    <section className="card overflow-hidden p-0" aria-label="Smallest set">
      <p className={cn(caption, "px-4 pt-3")}>Smallest set</p>
      <ol className="divide-y">
        {test.steps.map((s, i) => (
          <li key={s.topic} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-5 shrink-0 text-xs font-bold text-muted tabular">{i + 1}</span>
            <span className="min-w-0 flex-1 text-sm leading-snug">{s.name}</span>
            <span className="shrink-0 text-right text-xs font-bold tabular">
              {pct(s.share)}
              {s.full ? <span className="block font-medium text-muted">{s.full} full papers</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="border-t px-4 py-2 text-[11px] font-medium text-muted">Share of a paper's marks covered once you know every topic down to that one.</p>
    </section>
  );
}

function ByUnit({ course, picked, onPick }: { course: DeskCourse; picked: number | null; onPick: (n: number) => void }) {
  const units = course.units.filter((u) => u.pyq.length || u.questions);
  if (!units.length) return <p className="px-1 text-sm text-muted">No past questions sorted by unit yet.</p>;
  const unit = units.find((u) => u.n === picked) ?? units[0];
  return (
    <div className="space-y-4">
      <div className="px-1">
        <Pills options={units.map((u) => ({ value: u.n, label: `Unit ${u.n}` }))} value={unit.n} onChange={onPick} label="Unit" />
      </div>
      <UnitTopics course={course} unit={unit} />
    </div>
  );
}

function UnitTopics({ course, unit }: { course: DeskCourse; unit: DeskUnit }) {
  const [open, setOpen] = useState<string | null>(null);
  const state = useViewerLinkState();
  const topics = useMemo(() => [...unit.pyq].sort((a, b) => b.perPaper - a.perPaper), [unit.pyq]);
  return (
    <>
      <section className="card space-y-1 px-4 py-3">
        <h2 className="text-base font-extrabold">
          Unit {unit.n}
          {unit.title ? <span className="font-semibold text-muted"> · {unit.title}</span> : null}
        </h2>
        <p className="text-xs font-medium text-muted">
          {unit.questions} past questions, {unit.ctQuestions} from class tests ·{" "}
          <Link to={`/desk/practice?course=${course.key}&unit=${unit.n}`} className="font-bold text-accent">
            Practise this unit
          </Link>
        </p>
        {unit.notes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {unit.notes.map((n) => (
              <Link key={n.path} to={viewerHref(n.path)} state={state} className="rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-bold hover:bg-surface-2/70">
                {n.name}
              </Link>
            ))}
          </div>
        )}
      </section>
      <section className="card divide-y overflow-hidden p-0" aria-label={`Unit ${unit.n} topics`}>
        {topics.map((t) => {
          const isOpen = open === t.topic;
          const qs = [...t.questions].sort((a, b) => Number(b.kind === "ct") - Number(a.kind === "ct") || b.papers - a.papers);
          return (
            <div key={t.topic}>
              <button type="button" onClick={() => setOpen(isOpen ? null : t.topic)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-snug">{t.name}</span>
                  <span className="block text-xs font-medium text-muted tabular">
                    CTs {t.ct}/{t.ofCt} · end-sems {t.end}/{t.ofEnd} · {t.perPaper.toFixed(1)} marks a paper
                  </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="space-y-2 px-4 pb-4">
                  <ol className="space-y-2">
                    {qs.map((q, i) => (
                      <li key={i} className="space-y-1 rounded-xl bg-surface-2/60 p-3">
                        <p className="whitespace-pre-line wrap-break-word text-sm leading-relaxed">{q.text}</p>
                        <p className="text-[11px] font-semibold text-muted">
                          {KIND_LABEL[q.kind] ?? q.kind}
                          {q.marks ? ` · ${q.marks} marks` : ""}
                          {q.papers > 1 ? ` · asked in ${q.papers} papers` : ""}
                          {q.src.length ? ` · ${q.src.join("; ")}` : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                  <Link to={`/desk/practice?course=${course.key}&topic=${encodeURIComponent(t.topic)}`} className="inline-block text-xs font-bold text-accent">
                    Practise {qs.length > 1 ? "these" : "this"}
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}
