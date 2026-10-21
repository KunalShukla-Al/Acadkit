#!/usr/bin/env node
/**
 * The study-folder watcher, kept running by launchd (com.acadkit.studysync,
 * npm run mac:install). A change in the study folder, or in a folder
 * Autopilot watches (scripts/lib/autopilot.mjs), runs the auto-sync
 * tick (auto-sync.sh) once nothing has changed for 10 seconds, so a saved
 * note reaches the phone in about 15 seconds instead of up to 7 minutes.
 * The tick also runs every 3 minutes for what the app asks of the Mac
 * (deletes, uploads, the heartbeat), and that is when a semester switch's
 * new folder is picked up. A request heard over the instant link (link.mjs)
 * runs it at once.
 */
import { spawn } from "node:child_process";
import { readFileSync, watch } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { studyRoots } from "../lib/roots.mjs";
import { createClient } from "@supabase/supabase-js";
import { autopilotFolders } from "../lib/autopilot.mjs";
import { heard, listen } from "./link.mjs";

export const QUIET_MS = 10_000;
export const EVERY_MS = 180_000;

/**
 * The folders to watch, from a .env.local's text: STUDY_DIR and
 * STUDY_NEXT_DIR, and Autopilot's AUTOPILOT_FOLDERS unless it is off.
 */
export function watchedFolders(envText, home = homedir()) {
  const env = parseEnv(envText);
  const { dir, extras } = studyRoots(env, home);
  const picked = env.AUTOPILOT === "off" ? [] : autopilotFolders(env, home);
  return [...new Set([dir, ...extras.map((x) => x.dir), ...picked])];
}

/**
 * Changes the sync never sees: hidden and Office lock files, Python's
 * caches, and top-level "_" folders other than _src (scripts/sync-study-folder.mjs).
 */
export function ignored(rel) {
  const parts = String(rel).split(path.sep);
  if (parts.some((p) => p.startsWith(".") || p.startsWith("~$") || p === "__pycache__")) return true;
  return parts[0].startsWith("_") && parts[0] !== "_src";
}

/**
 * Runs `run` once nothing has changed for `quietMs`, every `everyMs`, and at
 * once for a request from the phone. One run at a time: a change or a
 * request during a run brings one more after it, and a 3-minute tick that
 * finds a run going is skipped.
 */
export function scheduler({ quietMs = QUIET_MS, everyMs = EVERY_MS, run }) {
  let quiet = null;
  let running = false;
  /** The run owed after this one: null for none, true after a change, false for a request. */
  let pending = null;
  async function go(afterChange, queue) {
    if (running) {
      if (queue) pending = pending === true || afterChange;
      return;
    }
    running = true;
    try {
      await run({ afterChange });
    } finally {
      running = false;
    }
    if (pending !== null) {
      const next = pending;
      pending = null;
      await go(next, true);
    }
  }
  const every = setInterval(() => void go(false, false).catch(() => {}), everyMs);
  return {
    change() {
      clearTimeout(quiet);
      quiet = setTimeout(() => {
        quiet = null;
        void go(true, true).catch(() => {});
      }, quietMs);
    },
    tick: () => go(false, false),
    request: () => go(false, true),
    stop() {
      clearTimeout(quiet);
      clearInterval(every);
    },
  };
}

const log = (line) => console.log(`${new Date().toLocaleString("sv-SE").slice(0, 19)} ${line}`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const envFile = path.join(repo, ".env.local");
  const tick = path.join(homedir(), "Library", "Application Support", "AcadKit", "auto-sync.sh");

  // The phone's requests, heard over Realtime as they are made, and the Mac's state for it (link.mjs).
  let env = {};
  try {
    env = parseEnv(readFileSync(envFile, "utf8"));
  } catch {
    /* no .env.local: the 3-minute tick alone */
  }
  let link = null;

  const runTick = ({ afterChange }) =>
    new Promise((resolve) => {
      link?.say("syncing");
      const child = spawn("/bin/bash", [tick], {
        cwd: repo,
        env: { ...process.env, ACADKIT_REPO: repo, ...(afterChange ? { AUTO_SYNC_QUIET: "1" } : {}) },
        stdio: "inherit",
      });
      const done = () => (link?.say("awake"), resolve());
      child.on("error", (err) => (log(`couldn't run the tick: ${err.message}`), done()));
      child.on("close", done);
    });
  const sync = scheduler({ run: runTick });

  // Re-read each tick, so a semester switch's new folder is watched from then on.
  let folders = [];
  let watchers = [];
  function rewatch() {
    let next;
    try {
      next = watchedFolders(readFileSync(envFile, "utf8"));
    } catch {
      next = watchedFolders("");
    }
    if (next.join("\n") === folders.join("\n") && watchers.length === next.length) return;
    for (const w of watchers) w.close();
    watchers = [];
    folders = next;
    for (const dir of folders) {
      try {
        const w = watch(dir, { recursive: true }, (_event, rel) => {
          if (rel && !ignored(rel)) sync.change();
        });
        // A folder moved to the Trash stops its watch; the next tick watches what's there.
        w.on("error", () => (w.close(), (watchers = watchers.filter((x) => x !== w))));
        watchers.push(w);
      } catch (err) {
        log(`can't watch ${dir}: ${err.message}`);
      }
    }
    log(`watching ${folders.join(", ")}`);
  }

  rewatch();
  setInterval(rewatch, EVERY_MS);
  void sync.tick();

  if (env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && /^\d{4}$/.test(env.STUDY_PIN ?? "")) {
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    link = listen({ supabase, pin: env.STUDY_PIN, log, onRequest: (payload) => (log(heard(payload)), void sync.request().catch(() => {})) });
  }
}
