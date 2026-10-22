/**
 * Starting jobq's Deliver workflow (github.com/KunalShukla-Al/jobq,
 * .github/workflows/deliver.yml) right after send-reminders queues work,
 * instead of waiting for GitHub's own schedule, which starts late or not
 * at all. No Deno or npm imports, so Vitest can load it.
 *
 * Deliver is started through the GitHub API ("workflow_dispatch"), with a
 * fine-grained token that can only run Actions on the jobq repo
 * (GITHUB_DISPATCH_TOKEN; how to make one is in DEPLOY.md). Without the
 * token nothing is started and nothing else changes. A start that fails
 * is reported, never thrown: it never stops a push, a queued job or the
 * run's answer.
 */

import type { JobqMode } from "./jobq.ts";

export interface DispatchConfig {
  /** Never logged, and never part of an error. */
  token: string;
  /** owner/name */
  repo: string;
  /** The workflow's file name (or id). */
  workflow: string;
  /** The branch the run uses. */
  ref: string;
}

export const DEFAULT_DISPATCH_REPO = "KunalShukla-Al/jobq";
export const DEFAULT_DISPATCH_WORKFLOW = "deliver.yml";

/** GitHub answers in well under a second; past this, give up for this run. */
export const DISPATCH_TIMEOUT_MS = 5_000;

/** The dispatch settings, or null without a token (dispatch off). */
export function dispatchConfig(env: (name: string) => string | undefined): DispatchConfig | null {
  const token = env("GITHUB_DISPATCH_TOKEN")?.trim();
  if (!token) return null;
  return {
    token,
    repo: env("GITHUB_DISPATCH_REPO")?.trim() || DEFAULT_DISPATCH_REPO,
    workflow: env("GITHUB_DISPATCH_WORKFLOW")?.trim() || DEFAULT_DISPATCH_WORKFLOW,
    ref: "main",
  };
}

/**
 * Whether this run should start Deliver:
 * - off: never. jobq isn't used.
 * - shadow: when this run queued something new (its do-nothing jobs).
 * - on: when this run queued something new, or jobq already has jobs
 *   due: a retry jobq scheduled for later, or a job whose run died
 *   holding it (`due`, from public.jobq_due, migration 042).
 * A job queued earlier was dispatched for then; this only adds a run.
 */
export function shouldDispatch(mode: JobqMode, enqueued: number, due = 0): boolean {
  if (mode === "off") return false;
  if (enqueued > 0) return true;
  return mode === "on" && due > 0;
}

/** On mode only asks the database how much is due when nothing new was queued. */
export function needsDueCount(mode: JobqMode, enqueued: number): boolean {
  return mode === "on" && enqueued === 0;
}

/** The workflow_dispatch call: POST /repos/{repo}/actions/workflows/{workflow}/dispatches. */
export function dispatchRequest(cfg: DispatchConfig): { url: string; init: RequestInit } {
  const [owner, name] = cfg.repo.split("/");
  return {
    url:
      `https://api.github.com/repos/${encodeURIComponent(owner ?? "")}/${encodeURIComponent(name ?? "")}` +
      `/actions/workflows/${encodeURIComponent(cfg.workflow)}/dispatches`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "acadkit-send-reminders",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: cfg.ref }),
    },
  };
}

export type DispatchResult = { dispatched: true } | { dispatched: false; error: string };

/**
 * Start the workflow once. GitHub answers 204 with no body when the run is
 * created. Never throws; the error says what GitHub said (its message,
 * e.g. "Bad credentials"), never the token.
 */
export async function dispatchDeliver(
  cfg: DispatchConfig,
  fetchFn: typeof fetch = fetch,
  timeoutMs: number = DISPATCH_TIMEOUT_MS
): Promise<DispatchResult> {
  const { url, init } = dispatchRequest(cfg);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal });
    if (res.ok) return { dispatched: true };
    let detail = "";
    try {
      const text = await res.text();
      try {
        detail = String((JSON.parse(text) as { message?: unknown }).message ?? text);
      } catch {
        detail = text;
      }
    } catch {
      detail = "";
    }
    return { dispatched: false, error: redact(`GitHub ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`, cfg.token) };
  } catch (err) {
    const message = controller.signal.aborted
      ? `no answer from GitHub in ${timeoutMs} ms`
      : (err as { message?: string })?.message ?? String(err);
    return { dispatched: false, error: redact(message, cfg.token) };
  } finally {
    clearTimeout(timer);
  }
}

/** Belt and braces: nothing GitHub or fetch says should ever carry the token. */
function redact(text: string, token: string): string {
  return token ? text.split(token).join("[token]") : text;
}
