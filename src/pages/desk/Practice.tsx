import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, FileText, Flag, Search, Shuffle, X } from "lucide-react";
import { AskClaude } from "@/components/desk/ask";
import { CoursePills } from "@/components/desk/course-pills";
import { DeskEmpty, DeskLoading } from "@/components/desk/states";
import { warmViewer } from "@/components/viewer/loaders";
import { Input, Select } from "@/components/ui/input";
import { useSetDeskProgress } from "@/hooks/useData";
import { useDeskCourse, useDeskIndex, useDeskProgressMap } from "@/hooks/useDesk";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import {
  coverage,
  filterFrom,
  filterItems,
  gradePick,
  KIND_LABEL,
  LETTERS,
  topicsOf,
  type DeskCourse,
  type DeskItem,
  type DeskProgress,
} from "@/lib/desk";
import { viewerHref } from "@/lib/viewer";
import { cn } from "@/lib/utils";

const FILTER_KEYS = ["unit", "topic", "kind", "part", "status", "q"];

/**
 * Every past-paper question of a course, one at a time: pick an option
 * (graded where a key exists), open the paper on its page or the worked
 * answer, mark it attempted or for revision, and ask Claude about it.
 */
export default function Practice() {
  useEffect(() => warmViewer(), []);
  const [params, setParams] = useSearchParams();
  const { index, courses } = useDeskIndex();
  const entry = courses.find((c) => c.key === params.get("course")) ?? courses[0] ?? null;
  const course = useDeskCourse(entry);
  const { map: progress } = useDeskProgressMap();
  const filter = useMemo(() => filterFrom(params), [params]);
  const items = useMemo(() => (course.data ? filterItems(course.data.items, filter, progress) : []), [course.data, filter, progress]);
  // Where you are in the list: back to the first question when the filters change, kept while a pick
  // changes what a status filter keeps.
  const filterKey = FILTER_KEYS.map((k) => params.get(k)).join("|") + entry?.key;
  const [pos, setPos] = useState({ key: filterKey, at: 0 });
  const at = pos.key === filterKey ? pos.at : 0;
  const setAt = (n: number) => setPos({ key: filterKey, at: n });
  const i = Math.min(at, Math.max(items.length - 1, 0));
  const item = items[i] ?? null;
  const go = (d: number) => {
    if (items.length) setAt((i + d + items.length) % items.length);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const set = (changes: Record<string, string | null>) =>
    setParams((p) => {
      for (const [k, v] of Object.entries(changes)) {
        if (v == null || v === "") p.delete(k);
        else p.set(k, v);
      }
      return p;
    }, { replace: true });

  if (index.isLoading || (entry && course.isLoading)) return <DeskLoading />;
  if (!entry || !course.data) return <DeskEmpty error={index.isError || course.isError} />;
  const c = course.data;
  const cov = coverage(c.items, progress);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <CoursePills courses={courses} value={entry.key} onChange={(k) => setParams({ course: k }, { replace: true })} />
      <Filters course={c} params={params} set={set} />
      <p className="px-1 text-xs font-medium text-muted tabular">
        {c.name}: {cov.attempted}/{cov.total} attempted
        {cov.graded ? ` · ${cov.correct}/${cov.graded} MCQs right` : ""}
        {cov.flagged ? ` · ${cov.flagged} to revise` : ""} · keys for {cov.keyed}/{cov.mcqs} MCQs · worked answers for {cov.solved}/{cov.written} written
      </p>
      {item ? (
        <>
          <QuestionCard key={item.key} course={c} item={item} progress={progress.get(item.key) ?? null} />
          <nav className="flex items-center gap-2 px-1" aria-label="Questions">
            <button type="button" onClick={() => go(-1)} aria-label="Previous question" className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 hover:bg-surface-2/70">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="flex-1 text-center text-sm font-bold tabular">
              {i + 1} / {items.length}
            </span>
            <button type="button" onClick={() => setAt(Math.floor(Math.random() * items.length))} aria-label="Random question" className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 hover:bg-surface-2/70">
              <Shuffle className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next question" className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 hover:bg-surface-2/70">
              <ChevronRight className="h-5 w-5" />
            </button>
          </nav>
          <p className="hidden px-1 text-center text-[11px] font-medium text-muted lg:block">← → move a question</p>
        </>
      ) : (
        <p className="card px-4 py-8 text-center text-sm font-medium text-muted">No question matches these filters.</p>
      )}
    </div>
  );
}

function Filters({ course, params, set }: { course: DeskCourse; params: URLSearchParams; set: (changes: Record<string, string | null>) => void }) {
  const unit = params.get("unit");
  const topics = useMemo(() => topicsOf(course.items).filter((t) => !unit || String(t.unit) === unit), [course.items, unit]);
  const units = [...new Set(course.items.map((i) => i.unit).filter((u): u is number => u != null))].sort((a, b) => a - b);
  const parts = [...new Set(course.items.map((i) => i.part))].sort();
  const kinds = [...new Set(course.items.map((i) => i.kind))];
  return (
    <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-3">
      <Select aria-label="Unit" value={unit ?? ""} onChange={(e) => set({ unit: e.target.value, topic: null })}>
        <option value="">All units</option>
        {units.map((u) => (
          <option key={u} value={u}>
            Unit {u}
          </option>
        ))}
      </Select>
      <Select aria-label="Topic" value={params.get("topic") ?? ""} onChange={(e) => set({ topic: e.target.value })}>
        <option value="">All topics</option>
        {topics.map((t) => (
          <option key={t.topic} value={t.topic}>
            {t.name} ({t.count})
          </option>
        ))}
      </Select>
      <Select aria-label="Source" value={params.get("kind") ?? ""} onChange={(e) => set({ kind: e.target.value })}>
        <option value="">Every source</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </Select>
      <Select aria-label="Part" value={params.get("part") ?? ""} onChange={(e) => set({ part: e.target.value })}>
        <option value="">Every part</option>
        {parts.map((p) => (
          <option key={p} value={p}>
            Part {p}
          </option>
        ))}
      </Select>
      <Select aria-label="Status" value={params.get("status") ?? ""} onChange={(e) => set({ status: e.target.value })}>
        <option value="">Any status</option>
        <option value="new">Not attempted</option>
        <option value="attempted">Attempted</option>
        <option value="wrong">Got wrong</option>
        <option value="flagged">To revise</option>
      </Select>
      <label className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input aria-label="Search questions" defaultValue={params.get("q") ?? ""} onChange={(e) => set({ q: e.target.value })} placeholder="Search" className="pl-9" />
      </label>
    </div>
  );
}

function QuestionCard({ course, item, progress }: { course: DeskCourse; item: DeskItem; progress: DeskProgress | null }) {
  const save = useSetDeskProgress();
  const state = useViewerLinkState();
  const [reveal, setReveal] = useState(false);
  const pick = progress?.pick ?? null;
  const keyed = !!item.answer;
  const now = () => new Date().toISOString();

  const choose = (letter: string) => {
    const result = gradePick(item, letter);
    save.mutate({ item_key: item.key, pick: letter, result, attempted_at: now(), ...(result === "wrong" ? { flag: true } : {}) });
  };

  return (
    <article className="card space-y-3 px-4 py-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted">
        {item.paper} · {item.slot}
        {item.marks ? ` · ${item.marks} mark${item.marks === 1 ? "" : "s"}` : ""} · {KIND_LABEL[item.kind]}
      </p>
      <p className="whitespace-pre-line wrap-break-word text-base leading-relaxed">{item.text}</p>
      <p className="text-xs font-medium text-muted">
        {item.unit ? `Unit ${item.unit} · ` : ""}
        {item.topicName}
        {item.repeats > 1 ? ` · asked ${item.repeats} times` : ""}
      </p>

      {item.options.length > 0 && (
        <ol className="space-y-1.5">
          {item.options.map((o, n) => {
            const letter = LETTERS[n];
            const picked = pick === letter;
            const right = keyed && pick && letter === item.answer;
            const wrong = keyed && picked && letter !== item.answer;
            return (
              <li key={letter}>
                <button
                  type="button"
                  onClick={() => choose(letter)}
                  aria-pressed={picked}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                    right ? "border-good bg-good/10" : wrong ? "border-bad bg-bad/10" : picked ? "border-accent bg-accent/10" : "hover:bg-surface-2/60"
                  )}
                >
                  <span className="w-4 shrink-0 font-extrabold">{letter}</span>
                  <span className="min-w-0 flex-1 wrap-break-word">{o}</span>
                  {right && <Check className="h-4 w-4 shrink-0 text-good" />}
                  {wrong && <X className="h-4 w-4 shrink-0 text-bad" />}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {item.options.length > 0 && pick && !keyed && (
        <p className="text-xs font-medium text-muted">No key for this one, so check it against your notes.{item.note ? ` ${item.note}` : ""}</p>
      )}
      {keyed && pick && item.note && <p className="text-xs font-medium text-muted">{item.note}</p>}

      {!item.options.length && (
        <div className="flex flex-wrap gap-2">
          {item.solution &&
            (reveal ? (
              <Link to={viewerHref(item.solution.file, item.solution.page)} state={state} className="flex items-center gap-1.5 rounded-xl bg-accent/15 px-3 py-2 text-xs font-bold text-accent-deep">
                <FileText className="h-3.5 w-3.5" /> Open the worked answer{item.solution.page ? `, page ${item.solution.page}` : ""}
              </Link>
            ) : (
              <button type="button" onClick={() => setReveal(true)} className="rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold hover:bg-surface-2/70">
                Show answer
              </button>
            ))}
          <button
            type="button"
            onClick={() => save.mutate({ item_key: item.key, attempted_at: progress?.attempted_at ? null : now(), result: progress?.attempted_at ? null : "unreviewed" })}
            aria-pressed={!!progress?.attempted_at}
            className={cn("rounded-xl px-3 py-2 text-xs font-bold", progress?.attempted_at ? "bg-good/15 text-good-deep" : "bg-surface-2 hover:bg-surface-2/70")}
          >
            {progress?.attempted_at ? "Attempted" : "Mark attempted"}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <button
          type="button"
          onClick={() => save.mutate({ item_key: item.key, flag: !progress?.flag })}
          aria-pressed={!!progress?.flag}
          className={cn("flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold", progress?.flag ? "bg-warn/15 text-warn-deep" : "bg-surface-2 hover:bg-surface-2/70")}
        >
          <Flag className="h-3.5 w-3.5" /> {progress?.flag ? "To revise" : "Revise later"}
        </button>
        {item.file && (
          <Link to={viewerHref(item.file, item.page)} state={state} className="flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-xs font-bold hover:bg-surface-2/70">
            <FileText className="h-3.5 w-3.5" /> Paper{item.page ? `, page ${item.page}` : ""}
          </Link>
        )}
        <AskClaude course={course} item={item} />
      </div>
    </article>
  );
}
