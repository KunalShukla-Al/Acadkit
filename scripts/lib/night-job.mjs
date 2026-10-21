/**
 * The night shift's job (scripts/night-shift.mjs, at 02:00): the work the
 * 3-minute tick does a little of, done in full while I sleep.
 *
 * 1. Every recording waiting is transcribed (the tick does one).
 * 2. Every file waiting for Autopilot is read and filed (the tick reads
 *    three), and past papers join the dataset.
 * 3. The study folder is synced with PDFs over 2 MB shrunk (the day's sync
 *    shrinks those over 8 MB), which frees space in the bucket. On Saturday
 *    nights every file is indexed again.
 *
 * It holds the tick's lock (sync.lock), so neither runs over the other.
 */
import { spawn } from "node:child_process";
import { mkdir, rm, stat, utimes } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK = path.join(homedir(), "Library", "Application Support", "AcadKit", "sync.lock");
/** As the tick (auto-sync.sh): a lock older than this is a crashed run's. */
const STALE_MS = 3 * 3_600_000;
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** The night's bar for shrinking a PDF before upload, in MB. */
export const NIGHT_SHRINK_MB = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Takes the tick's lock, waiting up to `waitMs` for a tick to finish, and
 * keeps it fresh while held. Returns release(), or null when it couldn't.
 */
export async function takeLock({ lock = LOCK, waitMs = 15 * 60_000, poll = 10_000, now = Date.now } = {}) {
  const until = now() + waitMs;
  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      const age = now() - (await stat(lock).then((s) => s.mtimeMs, () => now()));
      if (age > STALE_MS) await rm(lock, { recursive: true, force: true });
      else if (now() >= until) return null;
      else await sleep(poll);
    }
  }
  // A night's job can run past three hours: touched every five minutes, the lock never looks stale.
  const fresh = setInterval(() => utimes(lock, new Date(), new Date()).catch(() => {}), 5 * 60_000);
  fresh.unref();
  return async () => {
    clearInterval(fresh);
    await rm(lock, { recursive: true, force: true });
  };
}

/** The sync's flags for a night: a lower bar for shrinking, and everything indexed again on a Saturday night. */
export function syncFlags(night) {
  const saturday = new Date(`${night}T12:00:00`).getDay() === 6;
  return [`--shrink-over=${NIGHT_SHRINK_MB}`, ...(saturday ? ["--reindex"] : [])];
}

/** What a sync's log says it did: files indexed and MB saved by shrinking. */
export function syncSaid(out) {
  const indexed = /Search index: .*?(\d+) to index/.exec(out);
  const saved = /([\d.]+) MB saved/.exec(out);
  return { indexed: indexed ? Number(indexed[1]) : 0, savedMB: saved ? Number(saved[1]) : 0 };
}

/** Runs the study-folder sync with the night's flags, its output into the log. */
export function runSync(flags, { log = console.log, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(REPO, "scripts", "sync-study-folder.mjs"), ...flags], { cwd: REPO, env });
    let out = "";
    const take = (chunk) => {
      out += chunk;
      for (const line of String(chunk).split("\n")) if (line.trim()) log(`  sync: ${line}`);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`the sync exited ${code}`))));
  });
}

/**
 * The job's steps, in order, each { name, run } where run() returns what
 * it did as a short phrase ("" for nothing). One that fails is recorded
 * and the rest still run. Returns [{ name, said?, error?, seconds }].
 */
export async function runSteps(steps, { log = console.log } = {}) {
  const done = [];
  for (const step of steps) {
    const started = Date.now();
    try {
      const said = await step.run();
      done.push({ name: step.name, said, seconds: Math.round((Date.now() - started) / 1000) });
      log(`${step.name}: ${said || "nothing to do"}`);
    } catch (err) {
      done.push({ name: step.name, error: err.message, seconds: Math.round((Date.now() - started) / 1000) });
      log(`${step.name} failed: ${err.message}`);
    }
  }
  return done;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The night's steps for runSteps: transcribe, read and file, sync. Each
 * says what it did ("2 lectures transcribed"), or "" when there was nothing.
 */
export function nightSteps({ supabase, pin, dir, night, env = process.env, log = console.log, libs }) {
  const { recorder, handler, recorderMissing, syncLectures, isPaused, modelReady, readNew, autopilotFolders, fileInbox, contentReader, filer, addAccepted } = libs;
  return [
    {
      name: "Transcribe",
      run: async () => {
        const done = await recorder({ env, handle: handler({ supabase, pin, dir }), missing: recorderMissing, perTick: Infinity, log });
        await syncLectures({ supabase, pin, log });
        return done.length ? `${plural(done.length, "lecture")} transcribed` : "";
      },
    },
    {
      name: "Read",
      run: async () => {
        if (isPaused(env)) return "";
        if (!(await modelReady())) throw new Error("Ollama isn't serving the model");
        const read = await readNew({ supabase, pin, dir, folders: autopilotFolders(env), perTick: Infinity, log });
        const filed = await fileInbox({ supabase, pin, dir, readOf: await contentReader({ env }), onMove: filer({ supabase, pin, dir, log }), log });
        const added = await addAccepted({ supabase, pin, datasetDir: path.join(dir, "_src", "pyq_dataset"), log });
        return [read.length && `${plural(read.length, "file")} read`, filed && `${filed} filed`, added.length && `${plural(added.length, "past paper")} added`].filter(Boolean).join(", ");
      },
    },
    {
      name: "Sync",
      run: async () => {
        const { indexed, savedMB } = syncSaid(await runSync(syncFlags(night), { log, env }));
        return [indexed && `${plural(indexed, "file")} indexed`, savedMB && `${savedMB} MB saved by shrinking`].filter(Boolean).join(", ");
      },
    },
  ];
}

/**
 * What the morning push says (send-reminders reads it from <pin>/night-shift.json):
 * the steps' phrases as a sentence, and the names of the steps that failed.
 */
export function nightReport({ night, at, finished, steps }) {
  const said = steps.map((s) => s.said).filter(Boolean).join("; ");
  return { night, at, finished, said: said ? `${said[0].toUpperCase()}${said.slice(1)}.` : "", failed: steps.filter((s) => s.error).map((s) => s.name) };
}

/** The night's report, where the 07:00 push finds it. */
export async function sendReport(supabase, pin, report) {
  const { error } = await supabase.storage
    .from("study-files")
    .upload(`${pin}/night-shift.json`, JSON.stringify(report), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Couldn't send the night's report: ${error.message}`);
}
