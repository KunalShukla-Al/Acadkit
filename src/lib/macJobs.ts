/**
 * When the Mac last ran each of its jobs (scripts/lib/jobs.mjs writes
 * <pin>/jobs.json), said plainly for Study's Mac line.
 */

export type JobName = "sync" | "autopilot" | "recorder" | "night";

export interface MacJob {
  /** When it last ran, epoch ms. */
  at: number;
  ok: boolean;
  /** What it did ("412 files"), why it waited ("paused"), or its error. */
  note?: string;
}

export interface MacJobsData {
  version: 1;
  jobs: Partial<Record<JobName, MacJob>>;
}

/** In the order the sheet lists them. */
export const JOBS: { name: JobName; label: string }[] = [
  { name: "sync", label: "Study folder sync" },
  { name: "autopilot", label: "Autopilot" },
  { name: "recorder", label: "Class recorder" },
  { name: "night", label: "Night shift" },
];

/** A day without a sync: the Mac has been off, asleep or away. */
export const QUIET_AFTER = 24 * 60 * 60_000;

/** "just now", "4 min ago", "2 h ago", "yesterday", "3 days ago". */
export function ago(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export interface MacLineText {
  text: string;
  value: string;
  tone: "ink" | "warn" | "bad";
}

/**
 * The one line: a job that failed, else a Mac that hasn't synced in a day,
 * else that it's keeping up, with when it last synced. Null before the Mac
 * has said anything.
 */
export function macLine(data: MacJobsData | null | undefined, now: number): MacLineText | null {
  const ran = JOBS.flatMap(({ name, label }) => (data?.jobs[name] ? [{ label, job: data.jobs[name]! }] : []));
  if (!ran.length) return null;
  const failed = ran.find((r) => !r.job.ok);
  if (failed) return { text: `${failed.label} failed on your Mac`, value: ago(now - failed.job.at), tone: "bad" };
  const sync = data?.jobs.sync;
  if (sync && now - sync.at > QUIET_AFTER) return { text: "Your Mac last synced", value: ago(now - sync.at), tone: "warn" };
  const last = sync ?? ran.reduce((a, b) => (b.job.at > a.job.at ? b : a)).job;
  return { text: "Your Mac is keeping up", value: `${sync ? "synced" : "ran"} ${ago(now - last.at)}`, tone: "ink" };
}
