/**
 * Moving AcadKit from one semester's study folder to the next: by hand
 * (npm run semester:switch) or from the app ("Start the new semester" asks
 * the Mac, scripts/apply-app-requests.mjs). Either way the same steps run:
 *
 *   1. the new folder's _src gets the curriculum, syllabi and note tools,
 *      the Run-up plan and its generators, and an empty exam prep and
 *      suggestions list;
 *   2. STUDY_DIR in .env.local points at the new folder, and the Mac's
 *      auto-sync script reads it from there;
 *   3. a full sync runs - which takes the old folder's files out of storage -
 *      and the manifest is checked to name the new folder;
 *   4. only then, everything else the old folder left behind goes: its
 *      search index, file requests, suggestions, syllabus progress,
 *      portal and forecast history in Supabase, its caches on this Mac, and
 *      the folder itself (to the Trash).
 *
 * What a semester keeps is in History: the app archives each subject's
 * grade, attendance pattern and marks pattern before it starts the next.
 */
import { spawn } from "node:child_process";
import { access, chmod, copyFile, mkdir, readdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/** Copied from the old _src when the new one doesn't have them: the same for every semester (projects and the Run-up's generators outlive a semester). */
export const SEED = [
  "acadkit_curriculum.json", "acadkit_syllabi.json", "acadkit_projects.json", "md2pdf.py", "render_changed.py", "audit_pdfs.py", "README.txt",
  "build_runup.py", "learning_plan.py", "sem4_headstart.py",
];
/** The Run-up plan (scripts/lib/runup.mjs): it runs past the switch, into the next semester's head start. */
export const RUNUP = "acadkit_runup.json";
/** Started empty in the new _src: last semester's tests, deadlines and notices don't carry over. */
export const FRESH = {
  "acadkit_prep.json": { tests: [] },
  "acadkit_suggestions.json": { deadlines: [] },
  "acadkit_notices.json": { notices: [] },
};

export const STATE_DIR = path.join(homedir(), "Library", "Application Support", "AcadKit");
export const AUTO_SYNC = path.join(STATE_DIR, "auto-sync.sh");
export const CACHE_DIR = path.join(homedir(), "Library", "Caches", "AcadKit");

/** ~/Documents/SRM_Sem<n>. */
export function semesterDir(n, base = path.join(homedir(), "Documents")) {
  return path.join(base, `SRM_Sem${n}`);
}

/** "~/Documents/SRM_Sem3" or an absolute path, made absolute. */
export function expandHome(p, home = homedir()) {
  return p.replace(/^~(?=$|\/)/, home);
}

/** .env.local with STUDY_DIR set to `dir` (written with ~ when it's under home), every other line as it was. */
export function withStudyDir(envText, dir, home = homedir()) {
  const value = dir === home || dir.startsWith(`${home}/`) ? `~${dir.slice(home.length)}` : dir;
  const line = `STUDY_DIR=${value}`;
  if (/^STUDY_DIR=.*$/m.test(envText)) return envText.replace(/^STUDY_DIR=.*$/m, line);
  return `${envText}${envText === "" || envText.endsWith("\n") ? "" : "\n"}${line}\n`;
}

/** .env.local without a STUDY_NEXT_DIR naming `dir`: once the next semester's folder is the study folder, it isn't "next" any more. */
export function withoutNextDir(envText, dir, home = homedir()) {
  return envText.replace(/^STUDY_NEXT_DIR=(.*)(\n|$)/gm, (line, value) =>
    path.resolve(expandHome(value.trim(), home)) === path.resolve(dir) ? "" : line
  );
}

/** The STUDY_DIR in a .env.local, or null. */
export function studyDirOf(envText, home = homedir()) {
  const m = envText.match(/^STUDY_DIR=(.*)$/m);
  return m ? expandHome(m[1].trim(), home) : null;
}

// The auto-sync script as first installed names the folder outright.
const FIXED_DIR = /^DIR="\$HOME\/Documents\/[^"]+"$/m;
const ENV_DIR = [
  "# The study folder is STUDY_DIR in the repo's .env.local: npm run semester:switch moves it on.",
  `DIR="$(sed -n 's/^STUDY_DIR=//p' "$HOME/Acadkit/.env.local" | tail -1)"`,
  'DIR="${DIR/#\\~/$HOME}"',
  'DIR="${DIR:-$HOME/Documents/SRM_Sem3}"',
].join("\n");

/** The auto-sync script made to read its folder from .env.local; null when it already does (or isn't the one we know). */
export function autoSyncReadsEnv(script) {
  return FIXED_DIR.test(script) ? script.replace(FIXED_DIR, ENV_DIR) : null;
}

/**
 * Whether `dir` is a semester folder this may move to the Trash: an
 * SRM_Sem<n> directly in Documents, and nothing else - never home, never a
 * folder somebody pointed STUDY_DIR at by hand.
 */
export function isSemesterFolder(dir, home = homedir()) {
  const abs = path.resolve(dir);
  return path.dirname(abs) === path.join(home, "Documents") && /^SRM_Sem\d{1,2}$/.test(path.basename(abs));
}

/** The content hashes a manifest's files are stored under ("<pin>/blobs/<sha>.<ext>"): what the caches are keyed by. */
export function manifestShas(manifest) {
  const shas = new Set();
  for (const f of manifest?.files ?? []) {
    const m = /\/blobs\/([0-9a-f]{64})/.exec(f.key ?? "");
    if (m) shas.add(m[1]);
  }
  return shas;
}

/** Cache files (named "<sha>…") that belong to none of `keep`. */
export function staleCacheFiles(names, keep) {
  return names.filter((n) => {
    const m = /^([0-9a-f]{64})/.exec(n);
    return m && !keep.has(m[1]);
  });
}

/**
 * The Run-up plan moved into the folder named `toName`. Links into it,
 * filed ahead as "SRM_Sem4/…" (scripts/lib/roots.mjs), lose the prefix;
 * links to the old folder's files go, since those files leave AcadKit with
 * the switch. Task ids stay, so every tick still counts (migration 043).
 */
export function carryRunup(plan, toName) {
  const prefix = `${toName}/`;
  let kept = 0;
  let dropped = 0;
  const move = (p) => {
    if (typeof p === "string" && p.startsWith(prefix)) {
      kept++;
      return p.slice(prefix.length);
    }
    dropped++;
    return null;
  };
  // A link is a path or { path, why }.
  const moveAll = (list) =>
    (list ?? []).flatMap((f) => {
      const p = move(typeof f === "string" ? f : f?.path);
      return p === null ? [] : [typeof f === "string" ? p : { ...f, path: p }];
    });
  const events = (plan.events ?? []).map((e) => ({
    ...e,
    files: moveAll(e.files),
    pyqs: (e.pyqs ?? []).map((q) => {
      if (!q?.file) return q;
      const file = move(q.file);
      return { ...q, file, page: file === null ? null : q.page };
    }),
  }));
  const days = (plan.days ?? []).map((d) => ({ ...d, tasks: (d.tasks ?? []).map((t) => ({ ...t, files: moveAll(t.files) })) }));
  return { plan: { ...plan, events, days }, kept, dropped };
}

const BUCKET = "study-files";

async function downloadJson(supabase, key) {
  const { data, error } = await supabase.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

/** What the app shows while the Mac works through a switch (<pin>/semester-switch.json). */
export async function writeSwitchStatus(supabase, pin, status) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${pin}/semester-switch.json`, JSON.stringify({ ...status, at: Date.now() }), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(`Couldn't write the switch status: ${error.message}`);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const missingTable = (error) => error && /does not exist|schema cache/i.test(error.message);

/** A table's rows for this PIN, removed; a table that isn't there (an old migration) is skipped. */
async function clearRows(supabase, table, pin) {
  const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("device_id", pin);
  if (error && !missingTable(error)) throw new Error(`Couldn't clear ${table}: ${error.message}`);
  return count ?? 0;
}

/** This PIN's rows of `table` whose `column` isn't in `keep`, removed in batches (no URL-long "not in" lists). */
async function clearRowsNotIn(supabase, table, pin, column, keep) {
  const seen = new Set();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(column).eq("device_id", pin).range(from, from + 999);
    if (missingTable(error)) return 0;
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}`);
    for (const r of data ?? []) seen.add(r[column]);
    if ((data ?? []).length < 1000) break;
  }
  const stale = [...seen].filter((v) => !keep.has(v));
  let removed = 0;
  for (let i = 0; i < stale.length; i += 50) {
    const { error, count } = await supabase.from(table).delete({ count: "exact" }).eq("device_id", pin).in(column, stale.slice(i, i + 50));
    if (error) throw new Error(`Couldn't clear ${table}: ${error.message}`);
    removed += count ?? 0;
  }
  return removed;
}

/**
 * Everything the old folder left in Supabase once the new one is synced:
 * its search index, file requests (and their inbox copies), suggestions,
 * syllabus ticks for courses that are gone, the portal and forecast
 * history (History's archive keeps the attendance pattern), and the
 * recorded lectures (their transcripts stay on the Mac). Returns what it
 * removed, by table.
 */
export async function clearOldSupabase(supabase, pin) {
  const removed = {};
  const manifest = await downloadJson(supabase, `${pin}/manifest.json`);
  // The search index: chunks of files no longer in the folder (the sync drops most; this is the sweep).
  removed.study_chunks = await clearRowsNotIn(supabase, "study_chunks", pin, "file_key", new Set((manifest?.files ?? []).map((f) => f.key)));
  removed.study_file_deletions = await clearRows(supabase, "study_file_deletions", pin);
  removed.study_uploads = await clearRows(supabase, "study_uploads", pin);
  // Inbox copies of uploads the Mac never saved (<pin>/inbox/<uuid>/<name>), and any loose notes.
  const inbox = await supabase.storage.from(BUCKET).list(`${pin}/inbox`, { limit: 1000 });
  const stray = [];
  for (const o of inbox.data ?? []) {
    if (o.id) stray.push(`${pin}/inbox/${o.name}`);
    else {
      const inner = await supabase.storage.from(BUCKET).list(`${pin}/inbox/${o.name}`, { limit: 1000 });
      for (const f of inner.data ?? []) stray.push(`${pin}/inbox/${o.name}/${f.name}`);
    }
  }
  if (stray.length) await supabase.storage.from(BUCKET).remove(stray);
  removed.inbox = stray.length;
  removed.suggestions = await clearRows(supabase, "suggestions", pin);
  const courses = new Set(Object.keys((await downloadJson(supabase, `${pin}/units.json`))?.courses ?? {}));
  removed.syllabus_progress = await clearRowsNotIn(supabase, "syllabus_progress", pin, "course_code", courses);
  removed.portal_snapshot_history = await clearRows(supabase, "portal_snapshot_history", pin);
  removed.forecast_log = await clearRows(supabase, "forecast_log", pin);
  // A lecture's moments go with it (on delete cascade).
  removed.lectures = await clearRows(supabase, "lectures", pin);
  return removed;
}

/** This Mac's caches of files that aren't in the new folder: text, PDF previews, and the question and unit vectors. */
export async function clearOldCaches(manifest, cacheDir = CACHE_DIR) {
  const keep = manifestShas(manifest);
  let removed = 0;
  for (const sub of ["text", "renditions"]) {
    const dir = path.join(cacheDir, sub);
    const names = await readdir(dir).catch(() => []);
    for (const n of staleCacheFiles(names, keep)) {
      await rm(path.join(dir, n), { force: true });
      removed++;
    }
  }
  // Built from the old folder's past papers and syllabus units; rebuilt as the new one needs them.
  for (const f of ["question-vectors.json", "unit-vectors.json"]) await rm(path.join(cacheDir, f), { force: true });
  return removed;
}

/** `dir` to the Trash: macOS's trash command, else moved into ~/.Trash under a name that doesn't clash. */
export async function toTrash(dir, run = trashCommand) {
  try {
    await run(dir);
  } catch {
    const trash = path.join(homedir(), ".Trash");
    let dest = path.join(trash, path.basename(dir));
    for (let k = 2; await exists(dest); k++) dest = path.join(trash, `${path.basename(dir)} ${k}`);
    await rename(dir, dest);
  }
}

function trashCommand(dir) {
  return new Promise((resolve, reject) => {
    const child = spawn("/usr/bin/trash", [dir]);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`trash exited ${code}`))));
  });
}

/**
 * Move AcadKit from `from` to `to` (folders on this Mac). `runSync(dir)`
 * runs a full sync of `dir` and resolves to its output; `dryRun` only
 * reports. `lock`: take the auto-sync lock for the duration (false when
 * the auto-sync itself is the caller and already holds it). `removeOld`:
 * step 4 (see the header); the old folder only goes to the Trash when it's
 * an SRM_Sem<n> in Documents. Throws with a plain reason when it can't go
 * ahead; nothing is changed by then.
 */
export async function switchSemester({
  supabase,
  pin,
  from,
  to,
  envFile,
  autoSyncFile = AUTO_SYNC,
  stateDir = STATE_DIR,
  cacheDir = CACHE_DIR,
  runSync,
  trash = toTrash,
  isTrashable = isSemesterFolder,
  removeOld = true,
  dryRun = false,
  lock = true,
  log = console.log,
}) {
  if (path.resolve(from) === path.resolve(to)) throw new Error(`AcadKit already uses ${to}.`);
  if (!(await exists(to))) throw new Error(`There's no folder ${to} on this Mac. Make it (or copy the new semester's files in) first.`);
  const lockDir = path.join(stateDir, "sync.lock");
  if (lock && !dryRun) {
    try {
      await mkdir(lockDir);
    } catch {
      throw new Error("A sync is running right now. Try again in a few minutes.");
    }
  }
  const [fromName, toName] = [path.basename(from), path.basename(to)];
  const status = (state, message) => (dryRun ? null : writeSwitchStatus(supabase, pin, { state, from: fromName, to: toName, message }));
  try {
    await status("running", `Switching from ${fromName} to ${toName}`);

    // 1. The new folder's _src.
    const oldSrc = path.join(from, "_src");
    const newSrc = path.join(to, "_src");
    if (!dryRun) await mkdir(newSrc, { recursive: true });
    for (const name of SEED) {
      if ((await exists(path.join(newSrc, name))) || !(await exists(path.join(oldSrc, name)))) continue;
      log(`  _src/${name}: copied from ${fromName}`);
      if (!dryRun) await copyFile(path.join(oldSrc, name), path.join(newSrc, name));
    }
    for (const [name, body] of Object.entries(FRESH)) {
      if (await exists(path.join(newSrc, name))) continue;
      log(`  _src/${name}: started empty`);
      if (!dryRun) await writeFile(path.join(newSrc, name), `${JSON.stringify(body, null, 2)}\n`);
    }
    let plan = null;
    try {
      plan = JSON.parse(await readFile(path.join(oldSrc, RUNUP), "utf8"));
    } catch (err) {
      if (err.code !== "ENOENT") log(`  _src/${RUNUP}: not carried (${err.message})`);
    }
    if (plan && !(await exists(path.join(newSrc, RUNUP)))) {
      const carried = carryRunup(plan, toName);
      log(`  _src/${RUNUP}: carried from ${fromName}, ${carried.kept} links kept, ${carried.dropped} to ${fromName}'s files dropped`);
      if (!dryRun) await writeFile(path.join(newSrc, RUNUP), `${JSON.stringify(carried.plan, null, 1)}\n`);
    }

    // 2. Point the Mac at it.
    log(`STUDY_DIR → ${to}`);
    if (!dryRun) await writeFile(envFile, withoutNextDir(withStudyDir(await readFile(envFile, "utf8"), to), to));
    const script = await readFile(autoSyncFile, "utf8").catch(() => null);
    const patched = script && autoSyncReadsEnv(script);
    if (patched) {
      log("auto-sync.sh now reads the folder from .env.local");
      if (!dryRun) {
        // A new file renamed into place: bash reads a running script as it goes, so this
        // tick (if the auto-sync is the caller) keeps its old copy instead of a half-new one.
        const tmp = `${autoSyncFile}.new`;
        await writeFile(tmp, patched);
        await chmod(tmp, (await stat(autoSyncFile)).mode);
        await rename(tmp, autoSyncFile);
      }
    }

    const trashable = removeOld && isTrashable(from);
    if (dryRun) {
      log(`Then: a full sync of ${toName} (its files replace ${fromName}'s in AcadKit), and a check that the app shows it.`);
      if (removeOld) {
        log(`Then: ${fromName}'s search index, file requests, suggestions, syllabus progress, portal and forecast history go from Supabase, and its caches from this Mac.`);
        log(trashable ? `Then: ${from} goes to the Trash.` : `${from} stays where it is (only an SRM_Sem<n> in Documents is moved to the Trash).`);
      }
      return { dryRun: true };
    }

    // 3. Sync and check.
    log(`Syncing ${toName}…`);
    const out = await runSync(to);
    const after = await downloadJson(supabase, `${pin}/manifest.json`);
    if (after?.root !== toName) throw new Error(`The sync ran but the app still shows ${after?.root ?? "nothing"}:\n${String(out).slice(-800)}`);
    await writeFile(path.join(stateDir, "last-sync"), "");

    // 4. What the old folder left behind.
    let message = `Now on ${toName} (${after.files.length} files).`;
    if (removeOld) {
      const removed = await clearOldSupabase(supabase, pin);
      const caches = await clearOldCaches(after, cacheDir);
      log(`Cleared from Supabase: ${Object.entries(removed).map(([t, n]) => `${t} ${n}`).join(", ")}; ${caches} cached files from this Mac.`);
      if (trashable) {
        await trash(from);
        log(`${from} → Trash`);
        message += ` ${fromName} is in your Mac's Trash and its files are gone from AcadKit.`;
      } else {
        message += ` ${fromName}'s files are gone from AcadKit; the folder stays on your Mac.`;
      }
    }
    await status("done", message);
    log(message);
    return { files: after.files.length };
  } catch (err) {
    await status("failed", err.message).catch(() => {});
    throw err;
  } finally {
    if (lock && !dryRun) await rmdir(lockDir).catch(() => {});
  }
}

/** A full sync of a folder from the repo at `repo` (npm run sync:files with STUDY_DIR set); resolves to its output. */
export function syncRunner(repo, { echo = false } = {}) {
  return (dir) =>
    new Promise((resolve, reject) => {
      const child = spawn("npm", ["run", "-s", "sync:files"], { cwd: repo, env: { ...process.env, STUDY_DIR: dir } });
      let out = "";
      for (const s of [child.stdout, child.stderr])
        s.on("data", (d) => {
          out += d;
          if (echo) process.stdout.write(d);
        });
      child.on("close", (code) =>
        code === 0 ? resolve(out) : reject(new Error(`The sync failed (exit ${code}); the next auto-sync retries it.\n${out.slice(-800)}`))
      );
    });
}

/** The semester a switch request asks for: { to } from <pin>/inbox/semester-switch-<time>.json. */
export function requestedSemester(body) {
  const n = Number(body?.to);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/**
 * A "Start the new semester" from the app: the newest switch request in
 * this PIN's inbox (all of them are cleared), carried out with the auto-sync
 * already holding the lock. Prints "Switched to …" for the auto-sync's log.
 */
export async function applySemesterSwitch({ supabase, pin, dir, repo, envFile, documents, log = console.log, ...rest }) {
  const bucket = supabase.storage.from(BUCKET);
  const { data, error } = await bucket.list(`${pin}/inbox`, { limit: 1000 });
  if (error) throw new Error(`Couldn't read the inbox: ${error.message}`);
  const asks = (data ?? []).filter((o) => /^semester-switch-.*\.json$/.test(o.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (asks.length === 0) return null;
  const newest = asks[asks.length - 1];
  const body = await downloadJson(supabase, `${pin}/inbox/${newest.name}`);
  await bucket.remove(asks.map((o) => `${pin}/inbox/${o.name}`));
  const n = requestedSemester(body);
  if (!n) {
    await writeSwitchStatus(supabase, pin, { state: "failed", message: "The request didn't say which semester." });
    return null;
  }
  const to = semesterDir(n, documents);
  if (path.resolve(to) === path.resolve(dir)) {
    await writeSwitchStatus(supabase, pin, { state: "done", from: path.basename(dir), to: path.basename(to), message: `Already on ${path.basename(to)}.` });
    return null;
  }
  try {
    await switchSemester({ supabase, pin, from: dir, to, envFile, runSync: syncRunner(repo), lock: false, log: () => {}, ...rest });
    log(`Switched to ${path.basename(to)}`);
    return to;
  } catch (err) {
    log(`Couldn't switch to ${path.basename(to)}: ${err.message.split("\n")[0]}`);
    throw err;
  }
}
