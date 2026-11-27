/**
 * One tick of the PersonaOS orchestrator (scripts/persona.mjs): start every
 * job that's due, each under its own lock and time limit, and record how it
 * went. launchd starts a tick every minute and never two at once; a job still
 * running from `npm run persona -- run <job>` holds its lock and is skipped.
 */
import { capOf, spend } from "./budget.mjs";
import { MIN, alertFor, isDue, nextRecord } from "./schedule.mjs";

export const DEFAULT_TIMEOUT_MIN = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A `spendClaude(n)` for jobs: throws when today's cap has no room. Calls in
 * this process queue behind each other; the file lock covers a manual run in
 * another process.
 */
export function claudeBudget({ store, now, cap }) {
  let queue = Promise.resolve();
  const once = async (n) => {
    let lock = null;
    for (let i = 0; i < 50 && !lock; i++) {
      lock = await store.lock("claude-budget");
      if (!lock) await sleep(100);
    }
    if (!lock) throw new Error("Couldn't check the Claude budget");
    try {
      const { ok, budget } = spend(await store.readBudget(), n, cap, now());
      if (!ok) throw new Error(`Claude cap reached for today (${budget.used}/${cap})`);
      await store.writeBudget(budget);
    } finally {
      await store.unlock(lock);
    }
  };
  return (n = 1) => {
    const run = queue.then(() => once(n));
    queue = run.catch(() => {});
    return run;
  };
}

/**
 * Run one job under its lock and limit, record it, and alert on a streak.
 * Null when it was already running, or, unless `force`, no longer due once
 * the lock was taken (another process just ran it).
 */
export async function runJob({ job, store, now, notify, log, spendClaude, force = false }) {
  const lock = await store.lock(job.name);
  if (!lock) {
    log(`${job.name}: still running, skipped`);
    return null;
  }
  try {
    const rec = await store.read(job.name);
    if (!force && !isDue(job, rec, now())) return null;
    const started = now().getTime();
    const limitMin = job.timeoutMin ?? DEFAULT_TIMEOUT_MIN;
    const ac = new AbortController();
    let timer;
    let ok = true;
    let note = null;
    try {
      const ctx = { signal: ac.signal, now, spendClaude, log: (line) => log(`${job.name}: ${line}`) };
      const result = await Promise.race([
        Promise.resolve().then(() => job.run(ctx)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            ac.abort();
            reject(new Error(`stopped after ${limitMin} min`));
          }, limitMin * MIN);
        }),
      ]);
      if (typeof result === "string" && result) note = result;
    } catch (err) {
      ok = false;
      note = String(err?.message ?? err).slice(0, 200);
    } finally {
      clearTimeout(timer);
    }
    const next = nextRecord(rec, { started, ended: now().getTime(), ok, note }, job);
    await store.write(job.name, next);
    log(`${job.name}: ${ok ? "ok" : `failed (${next.fails} in a row)`}${note ? `: ${note}` : ""}`);
    const alert = alertFor(rec, next, job);
    if (alert) await notify(job, alert, next).catch((err) => log(`${job.name}: couldn't alert: ${err.message}`));
    return next;
  } finally {
    await store.unlock(lock);
  }
}

/** Every due job, run side by side. Returns `{ <job>: record }` for the jobs that ran. */
export async function tick({ jobs, store, now = () => new Date(), notify, log, env = process.env }) {
  const at = now();
  const spendClaude = claudeBudget({ store, now, cap: capOf(env) });
  const due = [];
  for (const job of jobs) if (isDue(job, await store.read(job.name), at)) due.push(job);
  const ran = {};
  await Promise.all(
    due.map(async (job) => {
      const rec = await runJob({ job, store, now, notify, log, spendClaude });
      if (rec) ran[job.name] = rec;
    })
  );
  return ran;
}
