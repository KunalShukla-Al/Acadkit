import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, FolderKanban } from "lucide-react";
import { usePin } from "@/hooks/useData";
import { fetchStudyProjects } from "@/api/studyFiles";
import { orderedTodos, type ProjectState } from "@/lib/projects";
import { cn } from "@/lib/utils";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
/** A YYYY-MM-DD day as "Fri, 16 Oct". Noon, so no time zone moves it to another day. */
const dayLabel = (day: string) => shortDate(`${day}T12:00:00`);
const caption = "text-[11px] font-bold uppercase tracking-widest text-muted";

const STATE_LABEL: Record<ProjectState, string> = { active: "On", waiting: "Upcoming", paused: "Paused", done: "Done" };

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
