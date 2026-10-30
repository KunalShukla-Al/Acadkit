#!/usr/bin/env node
/**
 * The sync watcher's watchdog, run every few minutes by launchd
 * (com.acadkit.watchdog). The watcher (watch.mjs) stamps `watch-heartbeat` as
 * each tick finishes, and a tick that overran is already stopped from inside by
 * watch.mjs's own timeout. What that can't catch is the whole node process
 * wedging — the event loop blocked, no tick running, yet alive, so launchd's
 * KeepAlive sees nothing wrong. That is the 28 Oct failure. Here an outside
 * process notices the silence and restarts the watcher.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 30 min: comfortably past a 3-minute tick plus the 20-minute tick timeout, so a
// long-but-healthy sync is never mistaken for a wedge.
export const MAX_SILENCE_MS = 1_800_000;

/** True when a present heartbeat is unreadable as a date, or older than maxAgeMs. */
export function isStale(heartbeatText, now = Date.now(), maxAgeMs = MAX_SILENCE_MS) {
  const beat = Date.parse(String(heartbeatText).trim());
  if (Number.isNaN(beat)) return true;
  return now - beat > maxAgeMs;
}

const log = (line) => console.log(`${new Date().toLocaleString("sv-SE").slice(0, 19)} watchdog: ${line}`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(homedir(), "Library", "Application Support", "AcadKit", "watch-heartbeat");

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.exit(0); // no heartbeat yet (fresh install or startup) — nothing to judge
  }

  if (!isStale(text)) process.exit(0); // healthy: stay quiet

  const beat = Date.parse(text.trim());
  const age = Number.isNaN(beat) ? "unreadable heartbeat" : `${Math.round((Date.now() - beat) / 60000)} min silent`;
  log(`watcher ${age}; restarting it`);
  try {
    execFileSync("/bin/launchctl", ["kickstart", "-k", `gui/${process.getuid()}/com.acadkit.studysync`]);
    log("restarted com.acadkit.studysync");
  } catch (err) {
    log(`restart failed: ${err.message}`);
    process.exit(1);
  }
}
