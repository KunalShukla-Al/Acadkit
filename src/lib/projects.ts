/**
 * The Study page's Projects card. Its data comes from the study folder's
 * _src through the sync (scripts/lib/weekly.mjs), which has already dropped
 * anything malformed.
 */

export type ProjectState = "active" | "waiting" | "paused" | "done";

export interface Project {
  name: string;
  state: ProjectState;
  status: string;
  next: string | null;
  url: string | null;
}

export interface Todo {
  text: string;
  project: string | null;
  /** YYYY-MM-DD. */
  due: string | null;
}

export interface ProjectsData {
  version: 1;
  generatedAt: number;
  /** YYYY-MM-DD: when the status lines were last written. */
  updated: string | null;
  projects: Project[];
  todos: Todo[];
}

/** To-dos in the order to do them: dated ones soonest first, then the rest as written. */
export function orderedTodos(todos: Todo[] | undefined): Todo[] {
  return (todos ?? [])
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (a.t.due && b.t.due ? a.t.due.localeCompare(b.t.due) : a.t.due ? -1 : b.t.due ? 1 : a.i - b.i))
    .map(({ t }) => t);
}
