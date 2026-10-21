/**
 * Night shift: the Mac's heavy work, done while I sleep (scripts/night-shift.mjs).
 * A launch agent starts it at 23:00. It holds a sleep assertion that macOS
 * honours only on the charger (caffeinate -s), so a Mac left plugged in with
 * its lid open is awake at 02:00 for the job. On battery the Mac sleeps as
 * usual and the night is skipped. The assertion goes when the job is done.
 *
 * NIGHT_SHIFT=off in .env.local turns it off.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const STATE = path.join(homedir(), "Library", "Application Support", "AcadKit", "night-shift.json");

/** The launch agent's start, the job's hour, and the morning, after which a late start does nothing. */
export const NIGHT = { from: "23:00", at: "02:00", until: "06:30" };

export const isOn = (env = process.env) => env.NIGHT_SHIFT !== "off";

const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const clock = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const dateOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Which night a moment belongs to, by the date it began ("2026-11-04" for
 * 23:30 on the 4th and for 02:00 on the 5th), or null in the day.
 */
export function nightOf(now, night = NIGHT) {
  const t = minutes(clock(now));
  if (t >= minutes(night.from)) return dateOf(now);
  if (t < minutes(night.until)) return dateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  return null;
}

/** Milliseconds from `now` to the job's hour: 0 when it has passed this night. */
export function untilJob(now, night = NIGHT) {
  const t = minutes(clock(now));
  const at = minutes(night.at);
  const wait = t >= minutes(night.from) ? 24 * 60 - t + at : at - t;
  return wait > 0 ? (wait * 60 - now.getSeconds()) * 1000 - now.getMilliseconds() : 0;
}

/** Whether the Mac is on the charger, from pmset. */
export async function onCharger(run = execFileP) {
  const { stdout } = await run("/usr/bin/pmset", ["-g", "batt"]).catch(() => ({ stdout: "" }));
  return /'AC Power'/.test(stdout);
}

/** What the last night shift did: { night, at, ... }, or null before the first. */
export async function lastNight(file = STATE) {
  return JSON.parse(await readFile(file, "utf8").catch(() => "null"));
}

export async function saveNight(record, file = STATE) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(record, null, 1));
}
