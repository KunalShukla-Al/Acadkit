import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, FileText, PlayCircle } from "lucide-react";
import { useDeskCourse, useDeskIndex, useDeskProgressMap } from "@/hooks/useDesk";
import { useSetDeskProgress } from "@/hooks/useData";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { STATUS_LABEL, topicKey, videoKey, type DeskCourse, type DeskStatus } from "@/lib/desk";
import { viewerHref } from "@/lib/viewer";
import { cn } from "@/lib/utils";

const squash = (s: string | null) => (s ?? "").replace(/\s/g, "").toUpperCase();
const STATUSES: DeskStatus[] = ["new", "learning", "done", "revise"];
const TONE: Record<DeskStatus, string> = {
  new: "bg-surface-2 text-muted",
  learning: "bg-accent/15 text-accent-deep",
  done: "bg-good/15 text-good-deep",
  revise: "bg-warn/15 text-warn-deep",
};
const mins = (s: number | null) => (s ? `${Math.round(s / 60)} min` : null);

/**
 * The Desk's units for a course on its Subject page: each topic with its
 * status, its videos with watched ticks, and the unit's notes, then the
 * course's papers. Nothing when the Desk doesn't have the course.
 */
export function SubjectDesk({ code }: { code: string }) {
  const { courses } = useDeskIndex();
  const entry = courses.find((c) => squash(c.code) === squash(code)) ?? null;
  const course = useDeskCourse(entry);
  if (!course.data) return null;
  return <Units course={course.data} />;
}

function Units({ course }: { course: DeskCourse }) {
  const { map } = useDeskProgressMap();
  const save = useSetDeskProgress();
  const state = useViewerLinkState();
  const [open, setOpen] = useState<number | null>(null);
  const units = course.units.filter((u) => u.topics.length || u.notes.length);
  if (!units.length && !course.papers.length) return null;

  return (
    <section className="card overflow-hidden p-0" aria-label="Units and videos">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Units, topics and videos</span>
          <span className="block text-xs font-medium text-muted">From the Desk · status and watched ticks show on every device</span>
        </span>
        <Link to={`/desk/practice?course=${course.key}`} className="shrink-0 text-xs font-bold text-accent">
          Practise
        </Link>
      </div>
      <ul className="divide-y border-t">
        {units.map((u) => {
          const keys = u.topics.map((t) => topicKey(course.key, u.n, t.n));
          const done = keys.filter((k) => map.get(k)?.status === "done").length;
          const isOpen = open === u.n;
          return (
            <li key={u.n}>
              <button type="button" onClick={() => setOpen(isOpen ? null : u.n)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    Unit {u.n}
                    {u.title ? <span className="font-medium text-muted"> · {u.title}</span> : null}
                  </span>
                  <span className="block text-xs font-medium text-muted tabular">
                    {done}/{u.topics.length} topics done · {u.topics.reduce((n, t) => n + t.videos.length, 0)} videos
                  </span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="space-y-3 px-4 pb-4">
                  {u.topics.map((t, ti) => {
                    const key = keys[ti];
                    const status = (map.get(key)?.status ?? "new") as DeskStatus;
                    return (
                      <div key={key} className="space-y-1.5 rounded-xl bg-surface-2/50 p-3">
                        <p className="text-sm font-semibold leading-snug">
                          {t.n != null ? `${u.n}.${t.n} ` : ""}
                          {t.title}
                        </p>
                        <div className="flex flex-wrap gap-1" role="group" aria-label={`Status of ${t.title}`}>
                          {STATUSES.map((st) => (
                            <button
                              key={st}
                              type="button"
                              aria-pressed={status === st}
                              onClick={() => save.mutate({ item_key: key, status: st })}
                              className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", status === st ? TONE[st] : "text-muted hover:text-ink")}
                            >
                              {STATUS_LABEL[st]}
                            </button>
                          ))}
                        </div>
                        {t.videos.length > 0 && (
                          <ul className="space-y-1 pt-1">
                            {t.videos.map((v) => {
                              const watched = !!map.get(videoKey(v.id))?.attempted_at;
                              return (
                                <li key={v.id} className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    aria-pressed={watched}
                                    aria-label={watched ? `Watched ${v.title ?? v.id}` : `Mark ${v.title ?? v.id} watched`}
                                    onClick={() => save.mutate({ item_key: videoKey(v.id), attempted_at: watched ? null : new Date().toISOString() })}
                                    className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", watched && "border-good bg-good text-bg")}
                                  >
                                    {watched && <Check className="h-3.5 w-3.5" />}
                                  </button>
                                  <a
                                    href={`https://www.youtube.com/watch?v=${v.id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={cn("flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold", watched ? "text-muted" : "text-ink")}
                                  >
                                    <PlayCircle className="h-3.5 w-3.5 shrink-0 text-accent" />
                                    <span className="truncate">{v.title ?? v.id}</span>
                                  </a>
                                  <span className="shrink-0 text-[11px] font-medium text-muted">
                                    {[v.teacher, mins(v.secs)].filter(Boolean).join(" · ")}
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {u.notes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {u.notes.map((n) => (
                        <Link key={n.path} to={viewerHref(n.path)} state={state} className="flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-[11px] font-bold hover:bg-surface-2/70">
                          <FileText className="h-3 w-3 text-accent" /> {n.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {course.papers.length > 0 && <Papers course={course} />}
    </section>
  );
}

function Papers({ course }: { course: DeskCourse }) {
  const [open, setOpen] = useState(false);
  const state = useViewerLinkState();
  return (
    <div className="border-t">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1 text-sm font-semibold">Past papers · {course.papers.length}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="divide-y border-t">
          {course.papers.map((p) => (
            <li key={p.path}>
              <Link to={viewerHref(p.path)} state={state} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold hover:bg-surface-2/60">
                <FileText className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.when && <span className="shrink-0 text-muted">{p.when}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
