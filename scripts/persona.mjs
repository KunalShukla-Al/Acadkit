/**
 * PersonaOS's orchestrator on this Mac (docs/persona.md): runs every job in
 * scripts/lib/persona/jobs.mjs on its schedule. launchd starts a tick each
 * minute (com.acadkit.persona, npm run mac:install).
 *
 *   npm run persona                 one tick: every job that's due
 *   npm run persona -- list         each job's last run and whether it's due
 *   npm run persona -- run <job>    one job now, whatever its schedule
 *   npm run persona -- calendar     the webcal:// link my iPhone Calendar subscribes to
 *
 * PERSONA=off in .env.local turns it off.
 */
import { execFile } from "node:child_process";
import { JOBS } from "./lib/persona/jobs.mjs";
import { isDue } from "./lib/persona/schedule.mjs";
import { store as openStore } from "./lib/persona/store.mjs";
import { DEFAULT_TIMEOUT_MIN, claudeBudget, runJob, tick } from "./lib/persona/tick.mjs";
import { capOf } from "./lib/persona/budget.mjs";
import { backend } from "./lib/persona/backend.mjs";
import { calendarLink } from "./lib/persona/calendar.mjs";

const log = (line) => console.log(`${new Date().toLocaleString("sv-SE").slice(0, 19)} persona: ${line}`);

/** A macOS notification when a job starts failing or works again. Phone alerts come with the push engine. */
function notify(job, kind, rec) {
  const text = kind === "failing" ? `${job.name} has failed ${rec.fails} times: ${rec.note ?? "no reason given"}` : `${job.name} works again`;
  const script = `display notification ${JSON.stringify(text)} with title "PersonaOS"`;
  return new Promise((resolve) => execFile("/usr/bin/osascript", ["-e", script], () => resolve()));
}

const when = (ms) => (ms ? new Date(ms).toLocaleString("sv-SE").slice(5, 16) : "never");

async function list(store) {
  const now = new Date();
  for (const job of JOBS) {
    const rec = await store.read(job.name);
    const plan = job.every ? `every ${job.every} min` : job.at ? `at ${job.at.join(", ")}` : "on demand";
    const state = !rec ? "not run yet" : rec.ok ? `ok ${when(rec.ended)}` : `failing ×${rec.fails}: ${rec.note}`;
    console.log(`${job.name.padEnd(16)} ${plan.padEnd(20)} ${state}${isDue(job, rec, now) ? "  · due" : ""}`);
  }
}

if (process.env.PERSONA === "off") process.exit(0);

const store = openStore();
const [cmd, name] = process.argv.slice(2);

// A job that ignores its time limit can't hold launchd's next tick forever.
const longest = Math.max(...JOBS.map((j) => j.timeoutMin ?? DEFAULT_TIMEOUT_MIN));
setTimeout(() => {
  log("tick overran its longest job's limit; stopping");
  process.exit(1);
}, (longest + 1) * 60_000).unref();

if (cmd === "list") {
  await list(store);
} else if (cmd === "run") {
  const job = JOBS.find((j) => j.name === name);
  if (!job) {
    console.error(`No job named ${name ?? "(none)"}. Jobs: ${JOBS.map((j) => j.name).join(", ")}`);
    process.exit(1);
  }
  const now = () => new Date();
  const rec = await runJob({ job, store, now, notify, log, force: true, spendClaude: claudeBudget({ store, now, cap: capOf() }) });
  process.exitCode = rec && !rec.ok ? 1 : 0;
} else if (cmd === "calendar") {
  try {
    console.log(await calendarLink(backend()));
  } catch (err) {
    console.error(`No calendar link: ${err.message}`);
    process.exitCode = 1;
  }
} else if (cmd === undefined) {
  await tick({ jobs: JOBS, store, notify, log });
} else {
  console.error(`Unknown command ${cmd}. Use list, run <job>, calendar, or nothing for one tick.`);
  process.exitCode = 1;
}
process.exit();
