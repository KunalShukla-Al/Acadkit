#!/usr/bin/env node
/** Mirror the study folder on this Mac into the private `study-files` bucket (migration 025), so Study can show it on any device. */
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { applyDeletions } from "./apply-study-deletions.mjs";
import { applyUploads } from "./apply-study-uploads.mjs";
import { indexStudyFolder } from "./study-index/index.mjs";
import { buildRenditions } from "./lib/renditions.mjs";
import { pyqNote, readPaperbank } from "./lib/paperbank.mjs";
import { studyRoots } from "./lib/roots.mjs";
import { readCourseTitles, subjectIndex, tagFile } from "./lib/tags.mjs";
import { checkNotices, checkProjects } from "./lib/weekly.mjs";
import { checkRunup, splitRunup } from "./lib/runup.mjs";
import { checkCards } from "./lib/cards.mjs";
import { STORAGE_LIMIT, UPLOAD_CAP, bucketUse, fitUploads } from "./lib/storage.mjs";
import { findGs, shrinkPdfs } from "./lib/shrink.mjs";
import { derivedCode, derivedFingerprint, lastDerived, recordDerived } from "./lib/derived.mjs";
import { searchMany } from "./study-index/search.mjs";
import { mineTopics, splitTopics } from "./study-index/topics.mjs";
import { buildSpace } from "./lib/connected.mjs";
import { linkByMeaning, linkByTime, mergeLinks, splitLinks } from "./lib/links.mjs";
import { STATE_DIR as RECORDER } from "./lib/recorder.mjs";
import { buildUnits } from "./study-index/units.mjs";
import { reportJobs } from "./lib/jobs.mjs";

const BUCKET = "study-files";
const MAX_BYTES = 50 * 1024 * 1024;
const dryRun = process.argv.includes("--dry-run");
const noIndex = process.argv.includes("--no-index");
const reindex = process.argv.includes("--reindex");
// The night shift shrinks PDFs from a lower size (scripts/lib/night-job.mjs): --shrink-over=2, in MB.
const shrinkOver = Number(process.argv.find((a) => a.startsWith("--shrink-over="))?.split("=")[1]) || null;

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pin = process.env.STUDY_PIN;
// STUDY_DIR, plus the next semester's folder (STUDY_NEXT_DIR) as one more top folder in it.
const { dir, extras } = studyRoots();

const missing = [
  !url && "VITE_SUPABASE_URL",
  !serviceKey && "SUPABASE_SERVICE_ROLE_KEY",
  !/^\d{4}$/.test(pin ?? "") && "STUDY_PIN (4 digits)",
].filter(Boolean);
if (missing.length) {
  console.error(`Add ${missing.join(", ")} to .env.local, then run this again.`);
  process.exit(1);
}

const TYPES = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  c: "text/plain; charset=utf-8", py: "text/plain; charset=utf-8", java: "text/plain; charset=utf-8",
  html: "text/html; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function walk(root, rel = "") {
  const out = [];
  for (const entry of await readdir(path.join(root, rel), { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith(".") || name.startsWith("_") || name.startsWith("~$")) continue;
    const child = rel ? `${rel}/${name}` : name;
    if (entry.isDirectory()) out.push(...(await walk(root, child)));
    else if (entry.isFile()) out.push(child);
  }
  return out;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

/** The weekly scan's findings, validated. */
const TYPES_OK = new Set(["exam", "assignment", "lab", "other"]);
const squash = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
async function readSuggestions(root) {
  let raw;
  try {
    raw = await readFile(path.join(root, "_src", "acadkit_suggestions.json"), "utf8");
  } catch {
    return { rows: [], bad: [] };
  }
  const rows = [];
  const bad = [];
  for (const [i, d] of (JSON.parse(raw).deadlines ?? []).entries()) {
    const due = new Date(d.due_date);
    const problem = !TYPES_OK.has(d.type)
      ? "type"
      : typeof d.due_date !== "string" || !/(Z|[+-]\d\d:\d\d)$/.test(d.due_date) || Number.isNaN(due.getTime())
        ? "due_date (needs a time zone, e.g. +05:30)"
        : d.max_marks != null && !(Number(d.max_marks) > 0)
          ? "max_marks"
          : null;
    if (problem) {
      bad.push(`#${i + 1} ${d.subject_code ?? ""} ${d.label ?? d.type ?? ""}: bad ${problem}`);
      continue;
    }
    const day = due.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const what = squash(d.label) || d.type;
    const key = createHash("sha256").update(`deadline|${squash(d.subject_code)}|${what}|${day}`).digest("hex").slice(0, 32);
    rows.push({
      device_id: pin,
      key,
      kind: "deadline",
      payload: {
        subject_code: d.subject_code ?? null,
        type: d.type,
        label: d.label ?? null,
        due_date: d.due_date,
        max_marks: d.max_marks == null ? null : Number(d.max_marks),
        // The old date when the scan saw this test move; the app then
        // offers Move on the existing deadline instead of Add.
        moved_from: d.moved_from && !Number.isNaN(new Date(d.moved_from).getTime()) ? d.moved_from : null,
      },
      source: d.source ? String(d.source).slice(0, 300) : null,
      evidence: d.evidence ? String(d.evidence).slice(0, 200) : null,
    });
  }
  // Marks plans: { subject_code, internal, components: [{ label, type, max }] }.
  // Keyed on the plan's content, so a plan that changes is a new offer
  // and one that hasn't can't come back after being dismissed.
  const KINDS = new Set(["CT", "Lab", "Assignment", "Project"]);
  for (const [i, p] of (JSON.parse(raw).plans ?? []).entries()) {
    const comps = Array.isArray(p.components) ? p.components : [];
    const sum = comps.reduce((s, c) => s + Number(c.max || 0), 0);
    const problem = !p.subject_code
      ? "subject_code"
      : !(p.internal > 0 && p.internal <= 100)
        ? "internal"
        : comps.length === 0 || comps.some((c) => !String(c.label ?? "").trim() || !KINDS.has(c.type) || !(Number(c.max) > 0))
          ? "components"
          : sum > p.internal
            ? `components (they add to ${sum}, more than internal ${p.internal})`
            : null;
    if (problem) {
      bad.push(`plan #${i + 1} ${p.subject_code ?? ""}: bad ${problem}`);
      continue;
    }
    const components = comps.map((c) => ({ label: String(c.label).trim(), type: c.type, max: Number(c.max) }));
    const sig = `${squash(p.subject_code)}|${p.internal}|${components.map((c) => `${squash(c.label)}:${c.type}:${c.max}`).join(",")}`;
    rows.push({
      device_id: pin,
      key: createHash("sha256").update(`plan|${sig}`).digest("hex").slice(0, 32),
      kind: "plan",
      payload: { subject_code: p.subject_code, internal: Number(p.internal), components },
      source: p.source ? String(p.source).slice(0, 300) : null,
      evidence: p.evidence ? String(p.evidence).slice(0, 200) : null,
    });
  }
  // Two rows the scan wrote twice would fail the whole batch on the
  // unique key; the first wins.
  const unique = new Map();
  for (const r of rows) if (!unique.has(r.key)) unique.set(r.key, r);
  return { rows: [...unique.values()], bad };
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const bucket = supabase.storage.from(BUCKET);
const manifestKey = `${pin}/manifest.json`;

// What's already up there, with each blob's bytes. A missing manifest just means first run.
const remoteKeys = new Set();
const remoteSize = new Map();
{
  let offset = 0;
  for (;;) {
    const { data, error } = await bucket.list(`${pin}/blobs`, { limit: 1000, offset });
    if (error) {
      console.error(`Couldn't read the bucket: ${error.message}. Has migration 025 been run?`);
      process.exit(1);
    }
    for (const o of data) {
      remoteKeys.add(`${pin}/blobs/${o.name}`);
      remoteSize.set(`${pin}/blobs/${o.name}`, Number(o.metadata?.size ?? 0));
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
}

// Files deleted in the app (migration 032) go to the Trash first, and files
// uploaded from it (033) are saved in, so the manifest below reflects both.
for (const [apply, what] of [[applyDeletions, "deletions"], [applyUploads, "uploads"]]) {
  try {
    await apply({ supabase, pin, dir, extras, dryRun });
  } catch (err) {
    console.error(`${err.message}. Syncing without applying ${what}.`);
  }
}

const files = [];
const skippedLarge = [];
const walked = (await walk(dir)).sort();
// Subject, unit and kind, read off each path (scripts/lib/tags.mjs). A
// subject folder named by title alone ("Operating_Systems") finds its code
// through the curriculum's course titles, then the syllabi's (an elective
// such as "Digital_Image_Processing" is in the syllabi only).
const courseTitles = await readCourseTitles(dir);
const topsOf = (rels) => [...new Set(rels.filter((r) => r.includes("/")).map((r) => r.split("/")[0]))];
const roots = [{ root: dir, prefix: "", rels: walked }];
for (const x of extras) {
  if (topsOf(walked).includes(x.prefix)) {
    console.error(`Not mirroring ${x.dir}: ${path.basename(dir)} already has a folder named ${x.prefix}.`);
    continue;
  }
  try {
    roots.push({ root: x.dir, prefix: `${x.prefix}/`, rels: (await walk(x.dir)).sort() });
  } catch (err) {
    console.error(`Not mirroring ${x.dir}: ${err.code === "ENOENT" ? "no such folder" : err.message}.`);
  }
}
// The past-paper export's reading of the papers, where a folder has one (scripts/lib/paperbank.mjs).
const paperbank = await readPaperbank(roots);
for (const { root, prefix, rels } of roots) {
  const subjects = subjectIndex(topsOf(rels), courseTitles);
  for (const rel of rels) {
    const full = path.join(root, rel);
    const info = await stat(full);
    if (info.size > MAX_BYTES) {
      skippedLarge.push(`${prefix}${rel} (${mb(info.size)})`);
      continue;
    }
    const bytes = await readFile(full);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const ext = path.extname(rel).slice(1).toLowerCase();
    files.push({
      path: `${prefix}${rel}`,
      size: info.size,
      mtime: Math.round(info.mtimeMs),
      key: `${pin}/blobs/${sha}${ext ? "." + ext : ""}`,
      // Tagged inside its own folder: "SRM_Sem4/Artificial_Intelligence/…" is AI's.
      ...tagFile(rel, subjects),
      ext,
      full,
      root,
      rel,
    });
  }
}

// Office files open in the app's viewer as a PDF LibreOffice made (scripts/lib/renditions.mjs):
// .doc/.ppt/.pptx have no reader in the app, and its .docx reader loses bullets, crops and layout.
// The original stays the download.
const previews = [];
for (const [rel, r] of await buildRenditions(files)) {
  const f = files.find((x) => x.path === rel);
  const key = `${pin}/blobs/${r.sha}.${r.ext}`;
  f.preview = { key, ext: r.ext };
  previews.push({ path: `${rel} (preview)`, key, full: r.full, ext: r.ext, size: 0 });
}

// The folder's own notes (a PDF built from _src/<same>.md) have a web version in _src/_html/ (md2pdf.py).
for (const f of files) {
  if (f.ext !== "pdf" || f.preview) continue;
  const html = path.join(f.root, "_src", "_html", f.rel.replace(/\.pdf$/i, ".html"));
  let bytes;
  try {
    bytes = await readFile(html);
  } catch {
    continue;
  }
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `${pin}/blobs/${sha}.html`;
  f.preview = { key, ext: "html" };
  previews.push({ path: `${f.path} (web)`, key, full: html, ext: "html", size: 0 });
}

// Big PDFs go up shrunk (scripts/lib/shrink.mjs); the Mac keeps the original. A shrunk copy
// smaller than what the bucket holds replaces it (adds() below), so the night's lower bar sticks.
const shrinkOpts = { gs: await findGs(), ...(shrinkOver ? { over: shrinkOver * 1024 * 1024 } : {}) };
if ((await shrinkPdfs(files, shrinkOpts)) === null) console.log("Big PDFs go up as they are: brew install ghostscript to shrink them.");

for (const p of previews) p.size = (await stat(p.full)).size;
const blobs = [...files, ...previews];
const wanted = new Set(blobs.map((f) => f.key));
/** Bytes a blob adds to the bucket: a shrunk PDF already up at full size gives some back. */
const adds = (f) => (f.uploadSize ?? f.size) - (remoteSize.get(f.key) ?? 0);
let toUpload = [...new Map(blobs.filter((f) => !remoteKeys.has(f.key) || adds(f) < 0).map((f) => [f.key, f])).values()];
const toRemove = [...remoteKeys].filter((k) => !wanted.has(k));

// The free plan stores 1 GB: nothing goes up that would take the bucket past 950 MB
// (scripts/lib/storage.mjs). A file that doesn't fit stays off Study until there's room.
let storage = null;
try {
  const before = await bucketUse(bucket);
  const base = before - toRemove.reduce((n, k) => n + (remoteSize.get(k) ?? 0), 0);
  const fit = fitUploads(toUpload, base, { size: adds });
  const refusedKeys = new Set(fit.refused.map((f) => f.key));
  files.splice(0, files.length, ...files.filter((f) => !refusedKeys.has(f.key)));
  for (const f of files) if (f.preview && refusedKeys.has(f.preview.key)) delete f.preview;
  // A preview goes up only with its file.
  const kept = new Set(files.flatMap((f) => [f.key, f.preview?.key]));
  toUpload = fit.accepted.filter((f) => kept.has(f.key));
  storage = { before, after: base + toUpload.reduce((n, f) => n + adds(f), 0), refused: fit.refused.filter((f) => !previews.includes(f)) };
} catch (err) {
  console.error(`Storage: ${err.message}. Uploading without the 950 MB check.`);
}

console.log(`${path.basename(dir)}: ${files.length} files, ${mb(files.reduce((s, f) => s + f.size, 0))}`);
for (const { prefix } of roots.slice(1)) console.log(`  of which ${prefix.slice(0, -1)} (next semester): ${files.filter((f) => f.path.startsWith(prefix)).length}`);
if (storage) console.log(`Storage: ${mb(storage.before)} of ${mb(STORAGE_LIMIT)} in the bucket, ${mb(storage.after)} after this sync`);
console.log(`Upload ${toUpload.length} (${mb(toUpload.reduce((s, f) => s + (f.uploadSize ?? f.size), 0))}), remove ${toRemove.length}`);
for (const s of skippedLarge) console.log(`  skipped, over 50 MB: ${s}`);
for (const f of storage?.refused ?? []) console.log(`  not uploaded, the bucket would pass ${mb(UPLOAD_CAP)}: ${f.path} (${mb(f.uploadSize ?? f.size)})`);

/** Exam prep: { tests: [{ subject_code, label, due_date, title, portion, pattern, papers, topics: [{ topic, unit, seen, of }], files: [{ path, why }] }] }. */
async function readPrep(root, known) {
  let raw;
  try {
    raw = await readFile(path.join(root, "_src", "acadkit_prep.json"), "utf8");
  } catch {
    return null;
  }
  const data = JSON.parse(raw);
  const warnings = [];
  const tests = [];
  for (const t of data.tests ?? []) {
    if (!t.subject_code || Number.isNaN(new Date(t.due_date).getTime()) || !/(Z|[+-]\d\d:\d\d)$/.test(t.due_date ?? "")) {
      warnings.push(`prep ${t.subject_code ?? "?"} ${t.label ?? ""}: needs subject_code and a due_date with a time zone`);
      continue;
    }
    const files = (t.files ?? []).filter((f) => {
      const ok = known.has(f.path);
      if (!ok) warnings.push(`prep ${t.subject_code} ${t.label ?? ""}: no such file ${f.path}`);
      return ok;
    });
    tests.push({ ...t, files, topics: (t.topics ?? []).filter((x) => x.topic) });
  }
  return { body: { version: 1, generatedAt: Date.now(), tests }, warnings };
}

/** A JSON file in _src, or null when it isn't there. */
async function readSrc(root, name) {
  try {
    return JSON.parse(await readFile(path.join(root, "_src", name), "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw new Error(`_src/${name}: ${e.message}`);
  }
}

const found = await readSuggestions(dir);
const known = new Set(files.map((f) => f.path));
const prep = await readPrep(dir, known);
if (prep) console.log(`Exam prep: ${prep.body.tests.length} tests${prep.warnings.length ? `, ${prep.warnings.length} warning(s)` : ""}`);
for (const w of prep?.warnings ?? []) console.log(`  ${w}`);
// The Study page's "This week" and "Projects" cards (scripts/lib/weekly.mjs).
const rawNotices = await readSrc(dir, "acadkit_notices.json");
const notices = rawNotices && checkNotices(rawNotices, known);
const rawProjects = await readSrc(dir, "acadkit_projects.json");
const projects = rawProjects && checkProjects(rawProjects);
if (notices) console.log(`Notices: ${notices.body.notices.length}${notices.warnings.length ? `, ${notices.warnings.length} warning(s)` : ""}`);
if (projects) console.log(`Projects: ${projects.body.projects.length}, to-dos: ${projects.body.todos.length}${projects.warnings.length ? `, ${projects.warnings.length} warning(s)` : ""}`);
for (const w of [...(notices?.warnings ?? []), ...(projects?.warnings ?? [])]) console.log(`  ${w}`);
// The Run-up page's day-by-day plan (scripts/lib/runup.mjs).
const rawRunup = await readSrc(dir, "acadkit_runup.json");
const runup = rawRunup && checkRunup(rawRunup, known, path.basename(dir));
if (runup)
  console.log(
    runup.body
      ? `Run-up: ${runup.body.days.length} days, ${runup.body.days.reduce((n, d) => n + d.tasks.length, 0)} tasks, ${runup.body.events.length} events${runup.warnings.length ? `, ${runup.warnings.length} warning(s)` : ""}`
      : "Run-up: not sent"
  );
for (const w of runup?.warnings ?? []) console.log(`  ${w}`);
// The flashcards (scripts/lib/cards.mjs).
const rawCards = await readSrc(dir, "acadkit_cards.json");
const cards = rawCards && checkCards(rawCards);
if (cards) console.log(cards.body ? `Flashcards: ${cards.body.cards.length}${cards.warnings.length ? `, ${cards.warnings.length} warning(s)` : ""}` : "Flashcards: not sent");
for (const w of cards?.warnings ?? []) console.log(`  ${w}`);
if (found.rows.length || found.bad.length)
  console.log(`Suggestions from the scan: ${found.rows.length} valid${found.bad.length ? `, ${found.bad.length} skipped` : ""}`);
for (const b of found.bad) console.log(`  skipped suggestion ${b}`);

if (dryRun) {
  for (const f of toUpload) console.log(`  + ${f.path}`);
  for (const r of found.rows)
    console.log(r.kind === "plan"
      ? `  ? plan ${r.payload.subject_code}: ${r.payload.components.map((c) => `${c.label} ${c.max}`).join(" · ")}`
      : `  ? ${r.payload.subject_code ?? "-"} ${r.payload.label ?? r.payload.type} ${r.payload.due_date}`);
  if (!noIndex) {
    await indexStudyFolder({ supabase, pin, files, reindex, dryRun: true });
  }
  console.log("Dry run: nothing changed.");
  process.exit(0);
}

let done = 0;
let failed = 0;
const queue = [...toUpload];
async function worker() {
  for (let f = queue.shift(); f; f = queue.shift()) {
    const { error } = await bucket.upload(f.key, await readFile(f.upload ?? f.full), {
      contentType: TYPES[f.ext] ?? "application/octet-stream",
      upsert: true,
      cacheControl: "31536000", // content-addressed: a key's bytes never change
    });
    if (error) {
      failed++;
      console.error(`  ✗ ${f.path}: ${error.message}`);
    } else {
      console.log(`  ✓ ${++done}/${toUpload.length} ${f.path}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

if (failed) {
  // Keep the old manifest: it only points at blobs that exist.
  console.error(`${failed} upload(s) failed. The app still shows the previous sync; run this again.`);
  await reportJobs({ supabase, pin, ran: { sync: { at: Date.now(), ok: false, note: `${failed} upload${failed === 1 ? "" : "s"} failed` } } });
  process.exit(1);
}

const manifest = {
  version: 1,
  root: path.basename(dir),
  syncedAt: Date.now(),
  // `size` is what the app downloads: a shrunk PDF's, not the original's.
  files: files.map(({ path: p, size, uploadSize, mtime, key, subject_code, unit, kind, preview }) => {
    const pyq = pyqNote(paperbank.files.get(p));
    return { path: p, size: uploadSize ?? size, mtime, key, subject_code, unit, kind, ...(preview ? { preview } : {}), ...(pyq ? { pyq } : {}) };
  }),
};
{
  const { error } = await bucket.upload(manifestKey, JSON.stringify(manifest), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) {
    console.error(`Couldn't write the manifest: ${error.message}`);
    process.exit(1);
  }
}

// The degree's curriculum (_src/acadkit_curriculum.json), for History's
// degree plan and semester setup. Refused if its credits don't add up:
// a typo there would move every graduation number.
{
  let cur = null;
  try {
    cur = JSON.parse(await readFile(path.join(dir, "_src", "acadkit_curriculum.json"), "utf8"));
  } catch {
    /* none */
  }
  if (cur) {
    const perSem = (cur.semesters ?? []).map((s) => [s.n, s.credits, (s.courses ?? []).reduce((n, c) => n + (c.credits ?? 0), 0)]);
    const bad = perSem.filter(([, want, got]) => want !== got);
    const total = perSem.reduce((n, [, , got]) => n + got, 0);
    if (bad.length || total !== cur.total_credits) {
      console.error(`Curriculum not sent: credits don't add up (${bad.map(([n, w, g]) => `sem ${n}: ${g} not ${w}`).join(", ") || `total ${total} not ${cur.total_credits}`}).`);
    } else {
      const { error } = await bucket.upload(`${pin}/curriculum.json`, JSON.stringify(cur), {
        contentType: "application/json",
        upsert: true,
        cacheControl: "0",
      });
      if (error) console.error(`Couldn't write the curriculum: ${error.message}`);
      else console.log(`Curriculum: ${cur.semesters.length} semesters, ${cur.total_credits} credits.`);
    }
  }
}

// Unit-by-unit syllabi (_src/acadkit_syllabi.json), for unit-level views.
{
  let raw = null;
  try {
    raw = await readFile(path.join(dir, "_src", "acadkit_syllabi.json"), "utf8");
  } catch {
    /* none */
  }
  if (raw) {
    const { error } = await bucket.upload(`${pin}/syllabi.json`, raw, {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
    if (error) console.error(`Couldn't write the syllabi: ${error.message}`);
    else console.log(`Syllabi: ${Object.keys(JSON.parse(raw).courses ?? {}).length} courses.`);
  }
}

// Which earlier units each unit leans on (the past-paper export), for the course pages.
if (paperbank.prereqs.length) {
  const { error } = await bucket.upload(`${pin}/prereqs.json`, JSON.stringify({ version: 1, links: paperbank.prereqs }), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) console.error(`Couldn't write prerequisites: ${error.message}`);
  else console.log(`Prerequisites: ${paperbank.prereqs.length} units.`);
}

if (prep) {
  const { error } = await bucket.upload(`${pin}/prep.json`, JSON.stringify(prep.body), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) console.error(`Couldn't write exam prep: ${error.message}`);
}
/**
 * An index and the content-named parts it lists (scripts/lib/runup.mjs): new
 * parts first, then the index, then the parts neither this index nor the one
 * it replaces names. The previous generation stays one more sync, for an app
 * still holding the old index.
 */
async function writeSplit(indexKey, dir, { index, parts }, namesOf) {
  const { data: listed, error: listError } = await bucket.list(`${pin}/${dir}`, { limit: 1000 });
  if (listError) throw new Error(listError.message);
  const present = new Set((listed ?? []).filter((o) => o.id).map((o) => `${dir}/${o.name}`));
  for (const p of parts) {
    if (present.has(p.name)) continue;
    const { error } = await bucket.upload(`${pin}/${p.name}`, p.json, { contentType: "application/json", upsert: true, cacheControl: "31536000" });
    if (error) throw new Error(`${p.name}: ${error.message}`);
  }
  let old = null;
  try {
    const { data } = await bucket.download(`${pin}/${indexKey}`);
    old = data ? JSON.parse(await data.text()) : null;
  } catch {
    /* no index yet, or not one this understands */
  }
  const { error } = await bucket.upload(`${pin}/${indexKey}`, JSON.stringify(index), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw new Error(error.message);
  const keep = new Set([...parts.map((p) => p.name), ...(old ? namesOf(old) : [])]);
  const stale = [...present].filter((n) => !keep.has(n)).map((n) => `${pin}/${n}`);
  if (stale.length) await bucket.remove(stale);
}

// The Run-up: an index and its parts, by month and by event (scripts/lib/runup.mjs).
if (runup?.body) {
  try {
    await writeSplit("runup.json", "runup", splitRunup(runup.body), (i) => [...(i.months ?? []), ...(i.events ?? []).map((e) => e.pyqsFile).filter(Boolean)]);
  } catch (err) {
    console.error(`Couldn't write the Run-up: ${err.message}`);
  }
}

for (const [name, checked] of [
  ["notices.json", notices],
  ["projects.json", projects],
  ["cards.json", cards?.body ? cards : null],
]) {
  if (!checked) continue;
  const { error } = await bucket.upload(`${pin}/${name}`, JSON.stringify(checked.body), {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0",
  });
  if (error) console.error(`Couldn't write ${name}: ${error.message}`);
}

// Only now that nothing points at them. quiz.json held the removed self-test's decks (migration 035).
const stale = [...toRemove, `${pin}/quiz.json`];
for (let i = 0; i < stale.length; i += 100) {
  const { error } = await bucket.remove(stale.slice(i, i + 100));
  if (error) console.error(`  couldn't remove old files: ${error.message} (harmless, retried next run)`);
}

// Study's storage meter.
if (storage) {
  const body = {
    version: 1,
    used: storage.after,
    limit: STORAGE_LIMIT,
    cap: UPLOAD_CAP,
    refused: storage.refused.map((f) => ({ path: f.path, size: f.uploadSize ?? f.size })),
    at: Date.now(),
  };
  const { error } = await bucket.upload(`${pin}/storage.json`, JSON.stringify(body), { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) console.error(`Couldn't write storage.json: ${error.message}`);
}

// Insert-or-ignore on (device_id, key): a finding the app has already seen keeps whatever you decided about it.
{
  const current = new Set(found.rows.map((r) => r.key));
  const { data: pending, error } = await supabase
    .from("suggestions")
    .select("id,key,kind")
    .eq("device_id", pin)
    .eq("status", "pending");
  if (!error) {
    const kinds = new Set(found.rows.map((r) => r.kind));
    const stale = pending.filter((p) => kinds.has(p.kind) && !current.has(p.key)).map((p) => p.id);
    if (stale.length && !dryRun) {
      // 'withdrawn', not 'dismissed': this is the scan's clean-up, not your decision, and the app's suggestion ranker learns from your decisions only (migration 029).
      let { error: e2 } = await supabase.from("suggestions").update({ status: "withdrawn" }).in("id", stale);
      if (e2 && /check constraint|violates/i.test(e2.message)) {
        ({ error: e2 } = await supabase.from("suggestions").update({ status: "dismissed" }).in("id", stale));
      }
      if (e2) console.error(`Couldn't withdraw stale suggestions: ${e2.message}`);
    }
    if (stale.length) console.log(`Withdrawn (no longer in the scan): ${stale.length}`);
  }
}

// Sent per kind, so a project that hasn't run migration 027 (which
// allows 'plan') still gets its deadlines.
for (const [kind, migration] of [["deadline", "026"], ["plan", "027"]]) {
  const rows = found.rows.filter((r) => r.kind === kind);
  if (!rows.length) continue;
  const { data, error } = await supabase
    .from("suggestions")
    .upsert(rows, { onConflict: "device_id,key", ignoreDuplicates: true })
    .select("id");
  if (error) console.error(`Couldn't send ${kind} suggestions: ${error.message}. Has migration ${migration} been run?`);
  else console.log(`${kind === "plan" ? "Marks plans" : "Deadlines"}: ${data.length} new, ${rows.length - data.length} already known.`);
}

/** Where to study each of a subject's past-paper topics: the passages nearest its typical question, from the subject's own files, one per file, three at most. One batched search for them all. */
const MIN_LINK_SIMILARITY = 0.8;
const LINK_TIER = { notes: 0, guide: 0, lab: 0, assignment: 0, whatsapp: 1, other: 1 };
const fileByKey = new Map(files.map((f) => [f.key, f]));
async function linkTopics(vectors, subjectCode) {
  return (await searchMany(supabase, pin, vectors)).map((hits) => {
    const best = new Map(); // path → first (closest) hit
    for (const hit of hits) {
      if (hit.similarity < MIN_LINK_SIMILARITY) break; // sorted by similarity
      const f = fileByKey.get(hit.file_key);
      if (!f || f.subject_code !== subjectCode || !(f.kind in LINK_TIER) || best.has(f.path)) continue;
      best.set(f.path, { path: f.path, page: hit.page ?? null, tier: LINK_TIER[f.kind] });
    }
    // Stable: within a tier, still closest first.
    return [...best.values()]
      .sort((a, b) => a.tier - b.tier)
      .slice(0, 3)
      .map(({ path: p, page }) => ({ path: p, page }));
  });
}

// Search by meaning (migration 030): read, cut and embed whatever is new, on this Mac (scripts/embedder).
// Last, and never fatal - the files above are synced either way.
let indexChanged = true;
if (!noIndex) {
  try {
    const result = await indexStudyFolder({ supabase, pin, files, reindex });
    indexChanged = !result || result.indexed > 0 || result.dropped > 0;
  } catch (err) {
    console.error(`Search index: stopped — ${err.message}. The files synced; run again to finish indexing.`);
  }
}

// Units and topics below are built again only when their inputs have changed (scripts/lib/derived.mjs).
const syllabiRaw = await readFile(path.join(dir, "_src", "acadkit_syllabi.json"), "utf8").catch(() => null);
const here = path.dirname(fileURLToPath(import.meta.url));
const builders = (await readdir(path.join(here, "study-index"))).filter((n) => n.endsWith(".mjs")).map((n) => path.join(here, "study-index", n));
const linkers = ["connected.mjs", "links.mjs", "lecture-align.mjs"].map((n) => path.join(here, "lib", n));
// Links take in the recorder's transcripts too: a new lecture links again.
const transcripts = await readdir(path.join(RECORDER, "transcripts"), { withFileTypes: true }).catch(() => []);
const derived = derivedFingerprint({
  pin,
  files,
  syllabi: syllabiRaw,
  code: await derivedCode([...builders, ...linkers, fileURLToPath(import.meta.url)]),
  switches: {
    STUDY_PAPERBANK_QUESTIONS: process.env.STUDY_PAPERBANK_QUESTIONS === "1" ? JSON.stringify([...paperbank.questions]) : "",
    transcripts: JSON.stringify(await Promise.all(transcripts.filter((e) => e.name.endsWith(".json")).map(async (e) => [e.name, (await stat(path.join(RECORDER, "transcripts", e.name))).mtimeMs]))),
  },
});
const rebuild = reindex || indexChanged || derived !== (await lastDerived());
let derivedOk = true;
if (!rebuild) console.log("Units and topics: inputs unchanged since the last build, skipped.");

// Syllabus units (_src/acadkit_syllabi.json, units.mjs): where your notes
// cover each unit. Written as <pin>/units.json. Needs the index above, so
// it runs after it; never fatal.
let unitVectors = null;
let syllabi = null;
if (rebuild) {
  let courses = null;
  try {
    courses = JSON.parse(syllabiRaw ?? "null")?.courses ?? null;
  } catch {
    /* unreadable syllabi */
  }
  if (courses) {
    try {
      const built = await buildUnits({ courses, files, supabase, pin });
      unitVectors = built.unitVectors;
      syllabi = built.syllabi;
      const { error } = await bucket.upload(`${pin}/units.json`, JSON.stringify(built.units), {
        contentType: "application/json",
        upsert: true,
        cacheControl: "0",
      });
      if (error) {
        derivedOk = false;
        console.error(`Couldn't write units: ${error.message}`);
      }
    } catch (err) {
      derivedOk = false;
      console.error(`Units: stopped — ${err.message}`);
    }
  }
}

if (!noIndex && rebuild) {
  // Past-paper topics: which questions keep coming back, by how many
  // papers asked them. Written as <pin>/topics.json for Exam prep.
  try {
    // Off unless STUDY_PAPERBANK_QUESTIONS=1: compared on Sem 3, the read questions placed more of
    // them in the syllabus but moved topics around, so it waits until the end-sems are over.
    const clean = process.env.STUDY_PAPERBANK_QUESTIONS === "1" ? paperbank.questions : null;
    const topics = await mineTopics({ files, link: linkTopics, unitVectors, syllabi, clean });
    if (topics) {
      // An index and a file per subject (splitTopics).
      await writeSplit("topics.json", "topics", splitTopics(topics), (i) => (i.subjects ?? []).map((s) => s.file).filter(Boolean));
      const n = topics.subjects.reduce((a, t) => a + t.topics.length, 0);
      console.log(`Topics: ${n} repeated topics across ${topics.subjects.length} subjects.`);
    }
  } catch (err) {
    derivedOk = false;
    console.error(`Topics: stopped — ${err.message}`);
  }
  // Everything connected (scripts/lib/connected.mjs, links.mjs): what each page, slide, question,
  // lecture moment and board photo links to, by time and by meaning. <pin>/links.json and a part
  // per course. The vectors are cached, so only new files are embedded.
  try {
    const { items, means } = await buildSpace({ dir });
    const links = mergeLinks(linkByTime(items), linkByMeaning(items, means));
    await writeSplit("links.json", "links", splitLinks(links, items), (i) => (i.courses ?? []).map((c) => c.file).filter(Boolean));
    const n = Object.values(links).reduce((a, l) => a + l.length, 0);
    console.log(`Connected: ${n.toLocaleString("en-IN")} links on ${Object.keys(links).length.toLocaleString("en-IN")} items.`);
  } catch (err) {
    derivedOk = false;
    console.error(`Connected: stopped — ${err.message}`);
  }
  if (derivedOk) await recordDerived(derived);
}

// For the Mac line on Today (scripts/lib/jobs.mjs).
await reportJobs({ supabase, pin, ran: { sync: { at: Date.now(), ok: true, note: `${files.length} files` } } });
console.log(`Synced. ${files.length} files are on Study.`);
