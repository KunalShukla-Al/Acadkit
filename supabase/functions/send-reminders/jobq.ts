/**
 * Handing reminders to jobq (github.com/KunalShukla-Al/jobq) instead of pushing
 * them from the function. No Deno or npm imports, so Vitest can load it.
 *
 * REMINDERS_VIA_JOBQ decides who delivers:
 * - "off" (the default): the function pushes, as it always has.
 * - "shadow": the function still pushes, and also queues a do-nothing
 *   ("noop") job per reminder, to compare against sent_notifications.
 * - "on": the function only queues a "webpush" job per reminder. jobq sends
 *   it and records it in sent_notifications once it's delivered.
 *
 * The job shapes are a contract with jobq's webpush handler; change them
 * in both repos together.
 */

export type JobqMode = "off" | "shadow" | "on";

/** Anything but "shadow" or "on" - unset, a typo - means off. */
export function parseMode(raw: string | undefined): JobqMode {
  const mode = raw?.trim().toLowerCase();
  return mode === "shadow" || mode === "on" ? mode : "off";
}

/** A reminder as send-reminders plans it (its Msg). */
export interface Reminder {
  device_id: string;
  kind: string;
  ref: string;
  title: string;
  body: string;
  url: string | null;
}

/** One element of the array public.jobq_enqueue(jobs jsonb) takes. */
export interface JobqJob {
  kind: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  run_at?: string;
}

/** The same (device_id, kind, ref) that sent_notifications is unique on. */
const reminderKey = (r: Pick<Reminder, "device_id" | "kind" | "ref">) =>
  `${r.device_id}:${r.kind}:${r.ref}`;

/** A job that delivers the reminder. jobq turns the payload into today's push message. */
export function webpushJob(r: Reminder): JobqJob {
  return {
    kind: "webpush",
    idempotency_key: `webpush:${reminderKey(r)}`,
    payload: {
      device_id: r.device_id,
      kind: r.kind,
      ref: r.ref,
      title: r.title,
      body: r.body,
      url: r.url,
    },
  };
}

/** A job that does nothing: one per reminder the function itself sends. */
export function shadowJob(r: Reminder): JobqJob {
  return { kind: "noop", idempotency_key: `shadow:${reminderKey(r)}`, payload: {} };
}

/** What to queue for this run's reminders in this mode. Nothing when off. */
export function jobsFor(mode: JobqMode, reminders: Reminder[]): JobqJob[] {
  if (mode === "on") return reminders.map(webpushJob);
  if (mode === "shadow") return reminders.map(shadowJob);
  return [];
}

/**
 * The reminders not yet in sent_notifications. With jobq on, the queue's
 * idempotency key only knows about jobs it has seen, so this is what stops
 * a reminder the function pushed itself (before the switch, or after a
 * rollback) from being queued and sent a second time.
 */
export function notYetSent<T extends Reminder>(
  reminders: T[],
  sent: Array<Pick<Reminder, "device_id" | "kind" | "ref">>
): T[] {
  const done = new Set(sent.map(reminderKey));
  return reminders.filter((r) => !done.has(reminderKey(r)));
}
