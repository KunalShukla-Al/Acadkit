/**
 * Where PersonaOS keeps its state on this Mac, one file per job so a job's
 * record is only ever written by whoever holds that job's lock:
 *
 *   ~/Library/Application Support/AcadKit/persona/
 *     jobs/<job>.json     its record (schedule.mjs nextRecord)
 *     locks/<job>.lock    the pid running it (claude-budget.lock guards claude.json)
 *     claude.json         Claude calls spent today
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const PERSONA_DIR = path.join(homedir(), "Library", "Application Support", "AcadKit", "persona");

/** True while `pid` is a running process (EPERM: running, someone else's). */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/** Write through a temporary file and a rename, so a reader never sees half a file. */
async function writeAtomic(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, text);
  await rename(tmp, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8").catch(() => "null"));
}

/**
 * The lock file for `name`, or null when a live process holds it. A lock
 * left by a process that has gone (a crash, a reboot) is taken over.
 */
export async function takeLock(dir, name, pid = process.pid, alive = isAlive) {
  const file = path.join(dir, `${name}.lock`);
  await mkdir(dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(file, String(pid), { flag: "wx" });
      return file;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const holder = Number(await readFile(file, "utf8").catch(() => ""));
      if (holder && alive(holder)) return null;
      await rm(file, { force: true });
    }
  }
  return null;
}

export function store(dir = PERSONA_DIR) {
  const jobFile = (name) => path.join(dir, "jobs", `${name}.json`);
  return {
    dir,
    read: (name) => readJson(jobFile(name)),
    write: (name, rec) => writeAtomic(jobFile(name), JSON.stringify(rec, null, 1)),
    lock: (name) => takeLock(path.join(dir, "locks"), name),
    unlock: (file) => rm(file, { force: true }),
    readBudget: () => readJson(path.join(dir, "claude.json")),
    writeBudget: (b) => writeAtomic(path.join(dir, "claude.json"), JSON.stringify(b)),
  };
}
