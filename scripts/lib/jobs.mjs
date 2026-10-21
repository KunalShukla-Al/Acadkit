/**
 * When the Mac last ran each of its jobs, for the Mac line on Today
 * (src/lib/macJobs.ts): <pin>/jobs.json in the study bucket,
 * { version: 1, jobs: { <job>: { at, ok, note? } } }.
 *
 *   sync       the study folder's sync (scripts/sync-study-folder.mjs)
 *   autopilot  reading what reached Inbox and the watched folders
 *   recorder   transcribing lectures, when RECORDER=on
 *   night      the night shift's job (scripts/night-shift.mjs)
 *
 * Each run merges what it ran into a copy kept on this Mac, and uploads it
 * at most every 10 minutes, or at once when a job's outcome changed. It
 * never throws: saying how a job went mustn't fail the job.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const JOBS_FILE = path.join(homedir(), "Library", "Application Support", "AcadKit", "jobs.json");
const EVERY = 10 * 60_000;

/** `saved` with `ran` merged in, and whether an outcome changed (a job new, or now failing or fixed). */
export function mergeJobs(saved, ran) {
  const jobs = { ...saved };
  let changed = false;
  for (const [name, entry] of Object.entries(ran)) {
    if (!jobs[name] || jobs[name].ok !== entry.ok) changed = true;
    jobs[name] = entry;
  }
  return { jobs, changed };
}

/** `fn` as job `name`: when it ran goes into `ran`, with its note (a string `fn` returns) or its error. Rethrows. */
export function tracked(ran, name, fn, now = () => Date.now()) {
  return async () => {
    try {
      const note = await fn();
      ran[name] = { at: now(), ok: true, ...(typeof note === "string" && note ? { note } : {}) };
    } catch (err) {
      ran[name] = { at: now(), ok: false, note: String(err?.message ?? err).slice(0, 140) };
      throw err;
    }
  };
}

/** Merge `ran` into the Mac's copy and upload it when it's due. */
export async function reportJobs({ supabase, pin, ran, file = JOBS_FILE, now = Date.now(), log = console.error }) {
  if (!Object.keys(ran).length) return;
  try {
    const saved = JSON.parse(await readFile(file, "utf8").catch(() => "null")) ?? { jobs: {}, uploaded: 0 };
    const { jobs, changed } = mergeJobs(saved.jobs ?? {}, ran);
    let uploaded = saved.uploaded ?? 0;
    if (changed || now - uploaded >= EVERY) {
      const { error } = await supabase.storage
        .from("study-files")
        .upload(`${pin}/jobs.json`, JSON.stringify({ version: 1, jobs }), { contentType: "application/json", upsert: true, cacheControl: "0" });
      if (error) throw new Error(error.message);
      uploaded = now;
    }
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ jobs, uploaded }));
  } catch (err) {
    log(`Couldn't say how the jobs went: ${err.message}`);
  }
}
