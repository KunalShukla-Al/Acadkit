#!/usr/bin/env node
/**
 * The Mac's menu bar, through SwiftBar (scripts/mac/swiftbar/acadkit.1m.sh
 * runs this every minute): the day and the next class in the bar, and in
 * the menu what Today says (the day's sentence, the classes, the Mac's
 * line with its jobs), with Sync now, Open Today and Pause Autopilot. An
 * action runs the plugin again with its name (`menubar.mjs sync`).
 *
 * The day's rows come from Supabase at most every 30 minutes and are kept
 * on the Mac in between; the sync's state is read off the files the tick
 * leaves (auto-sync.sh), and the jobs off the copy of jobs.json the Mac
 * keeps (scripts/lib/jobs.mjs).
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { today } from "../../packages/core/src/today.ts";
import { continueOffer } from "../../src/lib/reading.ts";
import { ago, JOBS, macLine } from "../../src/lib/macJobs.ts";
import { formatTime } from "../../packages/core/src/dates.ts";
import { JOBS_FILE } from "../lib/jobs.mjs";
import { istClock } from "../lib/inbox.mjs";
import { modelReady } from "../lib/ollama.mjs";
import { isPaused, pausedFile } from "../lib/autopilot.mjs";

export const STATE_DIR = path.join(homedir(), "Library", "Application Support", "AcadKit");
export const LOG = path.join(homedir(), "Library", "Logs", "AcadKit", "study-sync.log");
const CACHE_MS = 30 * 60_000;
export const APP_URL = "https://acadkit.vercel.app";
/** auto-sync.sh calls its lock stale after three hours. */
const STALE_LOCK_MS = 3 * 60 * 60_000;

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * What the tick's files say: syncing (its lock is held), or when it last
 * synced, and whether the last attempt since then failed (the log's last
 * verdict).
 */
export async function syncState({ stateDir = STATE_DIR, log = LOG, now = Date.now() } = {}) {
  const lock = await stat(path.join(stateDir, "sync.lock")).catch(() => null);
  const syncing = !!lock && now - lock.mtimeMs < STALE_LOCK_MS;
  const last = await stat(path.join(stateDir, "last-sync")).catch(() => null);
  const tail = (await readFile(log, "utf8").catch(() => "")).split("\n").slice(-300);
  const verdict = [...tail].reverse().find((l) => / ok \(uploaded| FAILED /.test(l));
  const failedAt = verdict?.includes(" FAILED ") ? verdict.slice(11, 16) : null;
  return { syncing, lastSync: last ? last.mtimeMs : null, failedAt };
}

/**
 * The bar and the menu, as SwiftBar reads them: the first line is the bar,
 * "---" starts the menu, "--" a line's submenu, and "| key=value" styles a
 * line. The menu has the day's sentence (the one Siri says), the classes,
 * then the Mac's line with its jobs.
 */
export function render({ day, time, sync, autopilot, jobs = null, reading = null, now = Date.now(), self = null, appUrl = APP_URL }) {
  /** A menu line that runs this plugin with an action, then redraws. */
  const action = (label, name) => (self ? `${label} | bash="${self}" param1=${name} terminal=false refresh=true` : null);
  const lines = [];
  const t = minutes(time);
  const on = day?.classes.find((c) => minutes(c.start) <= t && t < minutes(c.end));
  const next = day?.classes.find((c) => minutes(c.start) > t);
  let bar;
  if (!day) bar = "AcadKit";
  else if (day.dayOrder === null) bar = day.holiday ? "Holiday" : "No classes";
  else if (on) bar = `${on.short} now${next ? ` · ${next.short} ${formatTime(next.start)}` : ""}`;
  else if (next) bar = `DO ${day.dayOrder} · ${next.short} ${formatTime(next.start)}`;
  else bar = `DO ${day.dayOrder} · done`;
  lines.push(`${bar}${sync.syncing ? " ↻" : ""}`, "---");

  if (day) {
    // The sentence Today opens on, Siri says and the morning notification sends (core's today().say).
    if (day.say) lines.push(day.say);
    const date = new Date(`${day.date}T12:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });
    lines.push(`${date} | color=gray`);
    for (const c of day.classes) {
      const done = minutes(c.end) <= t;
      lines.push(`${c.short} ${formatTime(c.start)}–${formatTime(c.end)}${c.room ? ` · ${c.room}` : ""}${c === on ? " · now" : ""}${done ? " | color=gray" : ""}`);
    }
  } else {
    lines.push("Add the Supabase keys and STUDY_PIN to the repo's .env.local | color=gray");
  }

  lines.push(`Open Today | href=${appUrl}/`);
  // Continue (migration 062): the page you were just reading on your phone, opened here.
  const offer = continueOffer(reading, { kind: "computer", now });
  if (offer) {
    const name = offer.path.slice(offer.path.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
    const q = new URLSearchParams({ path: offer.path, ...(offer.page ? { page: String(offer.page) } : {}) });
    lines.push(`Continue ${name}${offer.page ? ` at p. ${offer.page}` : ""} | href=${appUrl}/view?${q}`);
  }

  lines.push("---");
  // The sync's own state first: it's live, where jobs.json is as of the last stamp.
  if (sync.syncing) lines.push("Syncing…");
  else if (sync.failedAt) lines.push(`Last sync failed at ${sync.failedAt} | color=red`);
  const line = macLine(jobs, now);
  if (line) {
    lines.push(`${line.text} · ${line.value}${line.tone === "bad" ? " | color=red" : ""}`);
    for (const { name, label } of JOBS) {
      const job = jobs.jobs[name];
      if (job) lines.push(`--${label} · ${job.ok ? "" : "failed "}${ago(now - job.at)}${job.note ? ` · ${job.note}` : ""}${job.ok ? "" : " | color=red"}`);
    }
  } else if (!sync.syncing && !sync.failedAt) {
    lines.push(sync.lastSync ? `Synced ${ago(now - sync.lastSync)}` : "Not synced yet");
  }
  if (!sync.syncing) lines.push(action("Sync now", "sync"));
  lines.push(autopilot === "on" ? "Autopilot is on" : autopilot === "paused" ? "Autopilot is paused" : "Autopilot is waiting for Ollama");
  lines.push(autopilot === "paused" ? action("Resume Autopilot", "resume") : action("Pause Autopilot", "pause"));
  return lines.filter((l) => l !== null).join("\n");
}

/** The rows the day is built from, from the cache when it is under 30 minutes old. */
async function timetable({ supabase, pin, stateDir = STATE_DIR, now = Date.now() }) {
  const file = path.join(stateDir, "menubar-cache.json");
  const cached = JSON.parse(await readFile(file, "utf8").catch(() => "null"));
  if (cached && cached.pin === pin && now - cached.at < CACHE_MS) return cached;
  const mine = (table) => supabase.from(table).select("*").eq("device_id", pin);
  const tables = ["settings", "subjects", "timetable_slots", "attendance", "portal_snapshots", "deadlines"];
  const got = await Promise.all(tables.map(mine));
  for (const r of got) if (r.error) throw new Error(r.error.message);
  const [settings, subjects, slots, attendance, snapshots, deadlines] = got.map((r) => r.data);
  const fresh = { at: now, pin, settings: settings[0] ?? null, subjects, slots, attendance, snapshots, deadlines };
  await mkdir(stateDir, { recursive: true });
  await writeFile(file, JSON.stringify(fresh));
  return fresh;
}

/**
 * What a menu line asked for: "sync" starts the tick now (it holds its own
 * lock, so it never runs twice), "pause" and "resume" Autopilot.
 */
export async function act(name, { stateDir = STATE_DIR, repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..") } = {}) {
  if (name === "sync") {
    const child = spawn("/bin/bash", [path.join(stateDir, "auto-sync.sh")], {
      env: { ...process.env, ACADKIT_REPO: repo, AUTO_SYNC_QUIET: "1" },
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } else if (name === "pause") {
    await mkdir(path.join(stateDir, "autopilot"), { recursive: true });
    await writeFile(pausedFile(path.join(stateDir, "autopilot")), new Date().toISOString());
  } else if (name === "resume") {
    await rm(pausedFile(path.join(stateDir, "autopilot")), { force: true });
  }
}

export async function main({ env = process.env, now = Date.now() } = {}) {
  const clock = istClock(new Date(now));
  let day = null;
  let reading = null;
  if (env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && /^\d{4}$/.test(env.STUDY_PIN ?? "")) {
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    try {
      const t = await timetable({ supabase, pin: env.STUDY_PIN, now });
      // A cache from before it held attendance still draws the day; the sentence fills in at the next fetch.
      day = today({ date: clock.date, time: clock.time, settings: t.settings, subjects: t.subjects, slots: t.slots, attendance: t.attendance ?? [], snapshots: t.snapshots ?? [], deadlines: t.deadlines ?? [] });
      ({ data: reading } = await supabase.from("reading_now").select("path, page, kind, updated_at").eq("device_id", env.STUDY_PIN).maybeSingle());
    } catch {
      /* offline: the menu shows the sync, without the day */
    }
  }
  const autopilot = isPaused(env) ? "paused" : (await modelReady()) ? "on" : "waiting";
  // SwiftBar names the plugin it is running, which the actions run again.
  const saved = JSON.parse(await readFile(JOBS_FILE, "utf8").catch(() => "null"));
  const jobs = saved ? { version: 1, jobs: saved.jobs ?? {} } : null;
  return render({ day, time: clock.time, sync: await syncState({ now }), autopilot, jobs, reading, now, self: env.SWIFTBAR_PLUGIN_PATH ?? null, appUrl: env.APP_URL ?? APP_URL });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2]) await act(process.argv[2]);
  else console.log(await main());
}
