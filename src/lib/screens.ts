/**
 * The five tabs, and the tab each route belongs to: what the bar and the
 * sidebar light up. Everything else opens from the corner (Calendar, Skips,
 * Settings, History) or the top bar (Run-up), and lights no tab.
 */

export type ScreenId = "today" | "timetable" | "attendance" | "marks" | "study";

/** In the bar's order. */
export const SCREENS: { id: ScreenId; to: string; label: string }[] = [
  { id: "today", to: "/", label: "Today" },
  { id: "timetable", to: "/timetable", label: "Timetable" },
  { id: "attendance", to: "/attendance", label: "Attendance" },
  { id: "marks", to: "/marks", label: "Marks" },
  { id: "study", to: "/study", label: "Study" },
];

const OWNERS: [prefix: string, screen: ScreenId][] = [
  ["/deadlines", "today"],
  ["/timetable", "timetable"],
  ["/attendance", "attendance"],
  ["/log", "attendance"],
  ["/marks", "marks"],
  ["/study", "study"],
  ["/subject", "study"],
  ["/practice", "study"],
  ["/view", "study"],
  ["/lecture", "study"],
];

/** Old screens and pages, by the tab (`?show=`) they were on: where each now lives. */
const MOVED: Record<string, (show: string | null) => string> = {
  "/grades": (show) => (show === "marks" ? "/marks" : show === "skips" ? "/skips" : "/attendance"),
  "/plan": (show) => ({ runup: "/runup", timetable: "/timetable", deadlines: "/deadlines" })[show ?? ""] ?? "/calendar",
  "/you": (show) => (show === "history" ? "/history" : "/settings"),
  "/survival": () => "/skips",
  "/insights": () => "/skips",
  "/files": () => "/study",
};

/**
 * Where an old link lands (a notification, a bookmark, a Shortcut): the
 * page it now is, keeping the rest of its query and its hash. Null for a
 * page that stays where it is.
 */
export function movedTo(pathname: string, search = "", hash = ""): string | null {
  const to = MOVED[pathname];
  if (!to) return null;
  const params = new URLSearchParams(search);
  const show = params.get("show");
  params.delete("show");
  const query = params.toString();
  return `${to(show)}${query ? `?${query}` : ""}${hash}`;
}

/** The study folder at `dir`, on Study. */
export function studyPath(dir = ""): string {
  return `/study${dir ? `?dir=${encodeURIComponent(dir)}` : ""}`;
}

/** The tab a path belongs to; null for a page that opens from the corner or the top bar. */
export function screenOf(pathname: string): ScreenId | null {
  if (pathname === "/") return "today";
  const hit = OWNERS.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? hit[1] : null;
}
