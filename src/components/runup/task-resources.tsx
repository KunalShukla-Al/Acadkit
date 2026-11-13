import { Link } from "react-router-dom";
import { Check, FileText, Play } from "lucide-react";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { viewerHref } from "@/lib/viewer";
import { formatMinutes, pyqProgress, pyqTickId, type RunupTask } from "@/lib/runup";
import { cn, haptic } from "@/lib/utils";

/**
 * What a task comes with besides its files: the videos to watch, and the
 * past-paper questions to write after it. Each question has its own tick,
 * kept beside the task's (pyqTickId), and opens its paper in the viewer.
 * The questions fold away, so a day's list stays a list.
 */
export function TaskResources({
  task,
  ticked,
  onToggle,
}: {
  task: RunupTask;
  ticked: ReadonlySet<string>;
  onToggle: (tickId: string, done: boolean) => void;
}) {
  const viewerState = useViewerLinkState();
  const videos = task.videos ?? [];
  const pyqs = task.pyqs ?? [];
  if (videos.length === 0 && pyqs.length === 0) return null;
  const written = pyqProgress(task, ticked);
  const watch = formatMinutes(videos.reduce((n, v) => n + (v.minutes ?? 0), 0));

  return (
    <div className="mt-2 space-y-2">
      {videos.length > 0 && (
        <ul className="space-y-1" aria-label={`Videos${watch ? `, ${watch}` : ""}`}>
          {videos.map((v) => (
            <li key={v.url}>
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-ink hover:text-accent"
              >
                <Play className="h-3.5 w-3.5 shrink-0 text-accent-2" aria-hidden />
                <span className="min-w-0 truncate">{v.title}</span>
                <span className="shrink-0 font-medium text-muted">
                  {[v.minutes ? `${v.minutes} min` : null, v.by].filter(Boolean).join(" · ")}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {pyqs.length > 0 && (
        <details className="group rounded-xl border bg-surface-2/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-bold [&::-webkit-details-marker]:hidden">
            <FileText className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            <span className="flex-1">Past questions to write</span>
            <span className="tabular font-semibold text-muted">
              {written.done}/{written.total} written
            </span>
          </summary>
          <ul className="divide-y border-t">
            {pyqs.map((q) => {
              const id = pyqTickId(task.id, q.key);
              const done = ticked.has(id);
              const name = [q.source, q.number].filter(Boolean).join(" · ");
              return (
                <li key={q.key} className="flex items-start gap-2.5 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      onToggle(id, !done);
                    }}
                    aria-pressed={done}
                    aria-label={`${done ? "Not written" : "Written"}: ${name}`}
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      done ? "border-good bg-good text-bg" : "border-line hover:border-accent"
                    )}
                  >
                    {done && <Check className="h-3 w-3" strokeWidth={3} />}
                  </button>
                  <div className={cn("min-w-0 flex-1 text-xs", done && "text-muted")}>
                    <p className="font-bold">
                      {name}
                      {q.marks ? <span className="ml-2 font-medium text-muted">{q.marks} marks</span> : null}
                    </p>
                    <p className="mt-0.5 leading-snug text-muted">{q.text}</p>
                  </div>
                  {q.file && (
                    <Link
                      to={viewerHref(q.file, q.page)}
                      state={viewerState}
                      aria-label={`Open the paper: ${name}`}
                      className="shrink-0 rounded-lg border px-2 py-1 text-[11px] font-bold text-accent-deep hover:border-accent"
                    >
                      Paper
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
