import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronDown, ChevronRight, ExternalLink, FolderKanban, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { FileRow, SwipeToDelete } from "@/components/study/file-row";
import { Dot } from "@/components/ui/misc";
import { useListedDeadlines, usePin, useSubjects } from "@/hooks/useData";
import { fetchStudyNotices, fetchStudyPrep, fetchStudyProjects } from "@/api/studyFiles";
import { deadlineLabel } from "@/lib/deadlines";
import { upcomingPrep } from "@/lib/examPrep";
import type { StudyFile } from "@/lib/studyFiles";
import { readHiddenNotices, writeHiddenNotices } from "@/lib/hiddenNotices";
import { activeNotices, daysAway, noticeKey, orderedTodos, weekAhead, type HiddenNotices, type Notice, type ProjectState, type WeekItem } from "@/lib/thisWeek";
import { cn } from "@/lib/utils";
import type { Subject } from "@acadkit/core/types";

const squash = (s: string) => s.replace(/\s/g, "").toUpperCase();
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
/** A YYYY-MM-DD day as "Fri, 16 Oct". Noon, so no time zone moves it to another day. */
const dayLabel = (day: string) => shortDate(`${day}T12:00:00`);
const caption = "text-[11px] font-bold uppercase tracking-widest text-muted";

/**
 * On the Study page: what's on in the next seven days (each test opens its
 * past papers and notes) and notices from the weekly scan, folded to one
 * line until opened, and a last row the page passes in (new files), always
 * shown. Swipe a notice right to remove it, as with a file; it stays gone on
 * this device.
 */
export function ThisWeekCard({ files, now, children }: { files: StudyFile[]; now: number; children?: ReactNode }) {
  const pin = usePin();
  const { data: deadlines } = useListedDeadlines();
  const { data: subjects } = useSubjects();
  const prep = useQuery({ queryKey: ["study-prep", pin], queryFn: () => fetchStudyPrep(pin), staleTime: 5 * 60_000, retry: 1 });
  const notices = useQuery({ queryKey: ["study-notices", pin], queryFn: () => fetchStudyNotices(pin), staleTime: 5 * 60_000, retry: 1 });
  const items = useMemo(() => weekAhead(deadlines, upcomingPrep(prep.data, now), subjects, now), [deadlines, prep.data, subjects, now]);
  const [hidden, setHidden] = useState<HiddenNotices>(() => readHiddenNotices(pin));
  const live = useMemo(() => activeNotices(notices.data, now, hidden), [notices.data, now, hidden]);
  const changeHidden = useCallback(
    (change: (h: HiddenNotices) => HiddenNotices) =>
      setHidden((h) => {
        const next = change(h);
        writeHiddenNotices(pin, next, now);
        return next;
      }),
    [pin, now]
  );
  const removeNotice = (n: Notice) => {
    const k = noticeKey(n);
    changeHidden((h) => ({ ...h, [k]: n.until }));
    toast("Notice removed", {
      action: {
        label: "Undo",
        onClick: () =>
          changeHidden((h) => Object.fromEntries(Object.entries(h).filter(([key]) => key !== k))),
      },
    });
  };
  const byCode = useMemo(() => new Map((subjects ?? []).map((s) => [squash(s.code), s])), [subjects]);
  const byPath = useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const [open, setOpen] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0 && live.length === 0 && !children) return null;
  const next = items[0];
  const summary = [
    `${items.length} due`,
    live.length ? `${live.length} notice${live.length === 1 ? "" : "s"}` : null,
    // The short name here: the rows below carry the subject.
    next ? `next: ${next.prep?.title ?? next.deadline?.title}, ${daysAway(next.due_date, now)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className="card divide-y overflow-hidden p-0">
      {(items.length > 0 || live.length > 0) && (
        <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          <CalendarClock className="h-4 w-4 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">This week</span>
            <span className="block truncate text-xs font-medium text-muted">{summary}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
        </button>
      )}
      {expanded &&
        items.map((item) => (
          <WeekRow
            key={item.key}
            item={item}
            subject={item.subject_code ? (byCode.get(item.subject_code) ?? null) : null}
            now={now}
            byPath={byPath}
            open={open === item.key}
            onToggle={() => setOpen(open === item.key ? null : item.key)}
          />
        ))}
      {expanded &&
        live.map((n) => {
          const subject = n.subject_code ? byCode.get(squash(n.subject_code)) : undefined;
          const file = n.file ? byPath.get(n.file) : undefined;
          return (
            <SwipeToDelete key={noticeKey(n)} onDelete={() => removeNotice(n)} label="Remove this notice">
              <div className="flex items-start gap-3 bg-surface px-4 py-3">
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <p className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">{n.text}</span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                    {subject && <Dot color={subject.color_hex} className="h-1.5 w-1.5" />}
                    {[subject?.short_name?.trim() || subject?.name, n.source, n.posted && dayLabel(n.posted)].filter(Boolean).join(" · ")}
                  </span>
                </p>
              </div>
              {file && <FileRow file={file} showFolder />}
            </SwipeToDelete>
          );
        })}
      {children}
    </section>
  );
}

/** A test by its prep title, else a deadline as "Subject · title". */
function itemTitle({ deadline, prep }: WeekItem, subject: Subject | null): string {
  return prep?.title ?? (deadline ? `${deadlineLabel(deadline, subject)} · ${deadline.title}` : "");
}

function WeekRow({
  item,
  subject,
  now,
  byPath,
  open,
  onToggle,
}: {
  item: WeekItem;
  subject: Subject | null;
  now: number;
  byPath: Map<string, StudyFile>;
  open: boolean;
  onToggle: () => void;
}) {
  const { prep } = item;
  const title = itemTitle(item, subject);
  const files = (prep?.files ?? []).map((f) => byPath.get(f.path)).filter((f): f is StudyFile => !!f);
  const topics = (prep?.topics ?? []).filter((t) => t.of > 0).slice(0, 3);
  const head = (
    <>
      {subject ? <Dot color={subject.color_hex} className="mt-[7px] h-2 w-2" /> : <span className="w-2 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs font-medium text-muted">
          {shortDate(item.due_date)} · {daysAway(item.due_date, now)}
          {files.length > 0 ? ` · ${files.length} file${files.length === 1 ? "" : "s"} to revise` : ""}
        </span>
      </span>
    </>
  );
  // Nothing to open: the row goes to the subject, or is just a line.
  if (!prep) {
    return item.subject_code ? (
      <Link to={`/subject/${item.subject_code}`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/60">
        {head}
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted" />
      </Link>
    ) : (
      <div className="flex items-start gap-3 px-4 py-3">{head}</div>
    );
  }
  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        {head}
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 pb-3">
          {(prep.portion || topics.length > 0) && (
            <div className="space-y-2 px-4 text-sm">
              {prep.portion && (
                <p>
                  <span className={caption}>Portion</span>
                  <span className="mt-0.5 block font-medium">{prep.portion}</span>
                </p>
              )}
              {topics.length > 0 && (
                <div>
                  <p className={caption}>Most asked in past papers</p>
                  <ul className="mt-1 space-y-0.5">
                    {topics.map((t) => (
                      <li key={t.topic} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 font-medium">{t.topic}</span>
                        <span className="shrink-0 text-xs font-bold tabular text-muted">
                          {t.seen}/{t.of}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          {files.length > 0 && (
            <div className="divide-y border-y">
              {files.map((f) => (
                <FileRow key={f.path} file={f} showFolder />
              ))}
            </div>
          )}
          <Link to={`/subject/${squash(prep.subject_code)}`} className="flex items-center gap-1 px-4 text-xs font-bold text-accent">
            Everything for this subject <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

const STATE_LABEL: Record<ProjectState, string> = { active: "On", waiting: "Waiting", paused: "Paused", done: "Done" };

/** Where each of my projects stands and the to-dos that are mine, folded to one line until opened. */
export function ProjectsCard({ now }: { now: number }) {
  const pin = usePin();
  const data = useQuery({ queryKey: ["study-projects", pin], queryFn: () => fetchStudyProjects(pin), staleTime: 5 * 60_000, retry: 1 });
  const [open, setOpen] = useState(false);
  const todos = useMemo(() => orderedTodos(data.data?.todos), [data.data]);
  const projects = data.data?.projects ?? [];
  if (projects.length === 0 && todos.length === 0) return null;
  const today = new Date(now).toLocaleDateString("en-CA");
  const active = projects.filter((p) => p.state === "active").length;

  return (
    <section className="card divide-y overflow-hidden p-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <FolderKanban className="h-4 w-4 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Projects</span>
          <span className="block truncate text-xs font-medium text-muted">
            {active} on · {todos.length} to-do{todos.length === 1 ? "" : "s"}
            {todos[0] ? ` · next: ${todos[0].text}` : ""}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          {projects.map((p) => (
            <div key={p.name} className={cn("px-4 py-3 text-sm", p.state === "done" && "opacity-60")}>
              <p className="flex items-center gap-2">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-bold hover:text-accent">
                    <span className="truncate">{p.name}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted" />
                  </a>
                ) : (
                  <span className="truncate font-bold">{p.name}</span>
                )}
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    p.state === "active" ? "bg-accent/15 text-accent-deep" : "bg-surface-2 text-muted"
                  )}
                >
                  {STATE_LABEL[p.state]}
                </span>
              </p>
              <p className="mt-0.5 font-medium text-muted">{p.status}</p>
              {p.next && (
                <p className="mt-0.5 text-xs font-semibold">
                  <span className="text-muted">Next: </span>
                  {p.next}
                </p>
              )}
            </div>
          ))}
          {todos.length > 0 && (
            <div className="px-4 py-3">
              <p className={caption}>Your to-dos</p>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {todos.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span aria-hidden className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-ink/20" />
                    <span className="min-w-0 flex-1 font-medium">
                      {t.text}
                      {t.project && <span className="text-xs font-semibold text-muted"> · {t.project}</span>}
                    </span>
                    {t.due && (
                      <span className={cn("shrink-0 text-xs font-bold tabular", t.due < today ? "text-bad-deep" : "text-muted")}>
                        {t.due < today ? "overdue" : `by ${dayLabel(t.due)}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.data?.updated && <p className="px-4 py-2 text-[11px] font-medium text-muted">Updated {dayLabel(data.data.updated)}</p>}
        </>
      )}
    </section>
  );
}
