#!/usr/bin/env node
/**
 * The night shift's run (scripts/lib/night-shift.mjs), started at 23:00 by
 * the launch agent com.acadkit.nightshift: awake on the charger until
 * 02:00, then the job, once a night, and its report for the morning push.
 */
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { addAccepted } from "./lib/paper-dataset.mjs";
import { autopilotFolders, contentReader, filer, isPaused, readNew } from "./lib/autopilot.mjs";
import { fileInbox } from "./lib/inbox.mjs";
import { syncLectures } from "./lib/lecture-sync.mjs";
import { nightReport, nightSteps, runSteps, sendReport, takeLock } from "./lib/night-job.mjs";
import { isOn, lastNight, NIGHT, nightOf, onCharger, saveNight, untilJob } from "./lib/night-shift.mjs";
import { modelReady } from "./lib/ollama.mjs";
import { reportJobs } from "./lib/jobs.mjs";
import { handler, recorder, recorderMissing } from "./lib/recorder.mjs";
import { studyRoots } from "./lib/roots.mjs";

const stamp = () => new Date().toLocaleString("sv-SE").slice(0, 19);
const log = (line) => console.log(`${stamp()} Night shift: ${line}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!isOn()) process.exit(0);
const night = nightOf(new Date());
// Started in the day: the agent fired late, when the Mac woke.
if (!night) process.exit(0);
if ((await lastNight())?.night === night) process.exit(0);

// Awake for as long as this runs. macOS honours -s only on the charger, so on battery the Mac
// sleeps as usual (pmset sleep 1).
spawn("/usr/bin/caffeinate", ["-s", "-w", String(process.pid)], { stdio: "ignore" }).unref();

if (untilJob(new Date()) > 0) {
  log(`awake on the charger until ${NIGHT.at}`);
  // A minute at a time: a timer doesn't count the time the Mac spends asleep.
  while (untilJob(new Date()) > 0 && nightOf(new Date()) === night) await sleep(Math.min(60_000, untilJob(new Date())));
}

if (nightOf(new Date()) !== night) {
  log("the Mac slept through the night; skipping it");
  await saveNight({ night, skipped: "asleep" });
} else if (!(await onCharger())) {
  log("on battery; skipping tonight");
  await saveNight({ night, skipped: "on battery" });
} else {
  await job();
}

/** The job (scripts/lib/night-job.mjs), with the tick's lock held so a sync doesn't run over it. */
async function job() {
  const { VITE_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STUDY_PIN: pin } = process.env;
  if (!url || !key || !/^\d{4}$/.test(pin ?? "")) {
    log("needs VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN; skipping tonight");
    return saveNight({ night, skipped: "not set up" });
  }
  const release = await takeLock();
  if (!release) {
    log("a sync held the lock for 15 minutes; skipping tonight");
    return saveNight({ night, skipped: "sync running" });
  }
  const at = new Date().toISOString();
  log("on the charger: starting the job");
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const libs = { recorder, handler, recorderMissing, syncLectures, isPaused, modelReady, readNew, autopilotFolders, fileInbox, contentReader, filer, addAccepted };
    const steps = await runSteps(nightSteps({ supabase, pin, dir: studyRoots().dir, night, log: (l) => log(l.trim()), libs }), { log });
    const record = { night, at, finished: new Date().toISOString(), steps };
    await saveNight(record);
    log(`done in ${Math.round((Date.now() - Date.parse(at)) / 60_000)} min`);
    // For the 07:00 push (send-reminders), and the Mac line on Today (scripts/lib/jobs.mjs).
    const report = nightReport(record);
    await sendReport(supabase, pin, report).catch((err) => log(err.message));
    await reportJobs({ supabase, pin, ran: { night: { at: Date.now(), ok: report.failed.length === 0, ...(report.said ? { note: report.said } : {}) } }, log });
  } finally {
    await release();
  }
}
