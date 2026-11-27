/**
 * When each PersonaOS job is due (docs/persona.md). Pure: a job, its record
 * and the clock come in; a decision comes out.
 *
 *   every: 10              every 10 minutes
 *   at: ["07:00"]          at set times of day; a slot missed by more than
 *                          graceMin (180) while the Mac slept is skipped
 *   window: ["07:00", "22:00"]   only inside these hours (may wrap midnight)
 *
 * A job with neither runs only when asked (`npm run persona -- run <job>`).
 * A failure retries after 1, 2, 4 … minutes, never later than the job's own
 * interval (an hour for `at` jobs). After `alertAfter` failures in a row (3)
 * it says so once, and again when it works.
 */

export const MIN = 60_000;
export const ALERT_AFTER = 3;
const GRACE_MIN = 180;

const minuteOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const minuteOfDay = (d) => d.getHours() * 60 + d.getMinutes();

/** Whether `now` falls inside [from, to). A window that wraps midnight ("22:00"–"06:00") works too. */
export function inWindow([from, to], now) {
  const t = minuteOfDay(now);
  const a = minuteOf(from);
  const b = minuteOf(to);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

/** The latest `at` slot at or before `now`: today's, or yesterday's last before the first slot. */
export function lastSlot(at, now) {
  const t = minuteOfDay(now);
  const slots = at.map(minuteOf).sort((x, y) => x - y);
  const today = slots.filter((s) => s <= t).pop();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (today === undefined ? 1 : 0));
  const m = today ?? slots[slots.length - 1];
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(m / 60), m % 60);
}

/** Minutes to wait before retrying after `fails` failures in a row. */
export function retryAfter(fails, job) {
  return Math.min(2 ** Math.max(fails - 1, 0), job.every ?? 60);
}

/** Whether `job` should start at `now`, given its record (null before its first run). */
export function isDue(job, rec, now) {
  if (job.window && !inWindow(job.window, now)) return false;
  const t = now.getTime();
  if (rec?.fails) return t >= rec.retryAt;
  if (job.every) return !rec || t - rec.started >= job.every * MIN;
  if (job.at?.length) {
    const slot = lastSlot(job.at, now).getTime();
    if (t - slot > (job.graceMin ?? GRACE_MIN) * MIN) return false;
    return !rec || rec.started < slot;
  }
  return false;
}

/** The record after a run: when it started and ended, how it went, and the failure streak. */
export function nextRecord(rec, { started, ended, ok, note = null }, job) {
  const fails = ok ? 0 : (rec?.fails ?? 0) + 1;
  return {
    started,
    ended,
    ok,
    note,
    lastOk: ok ? ended : (rec?.lastOk ?? null),
    fails,
    retryAt: ok ? null : started + retryAfter(fails, job) * MIN,
    alerted: !ok && (Boolean(rec?.alerted) || fails >= (job.alertAfter ?? ALERT_AFTER)),
  };
}

/** "failing" the run a streak reaches the job's limit, "fixed" the run after an alerted streak, else null. */
export function alertFor(prev, next, job) {
  if (!next.ok && next.fails === (job.alertAfter ?? ALERT_AFTER)) return "failing";
  if (next.ok && prev?.alerted) return "fixed";
  return null;
}
