/**
 * Autopilot: the Mac's model (scripts/lib/ollama.mjs) reads each photo and
 * PDF that reaches the study folder's Inbox, or a folder I pick to watch,
 * and says what it is: a notice, notes, a board photo, slides, a question
 * paper, an assignment, or none of these, and which course it belongs to.
 * Study material from a watched folder is copied into Inbox; the original
 * stays where it is. Each file is read once, by its content hash; what was
 * read is kept on the Mac.
 *
 * In .env.local: AUTOPILOT_FOLDERS="~/Downloads, ~/Desktop/WhatsApp" picks
 * the folders, and AUTOPILOT=off turns it off; the menu bar pauses it for a
 * while (pausedFile). Without Ollama, or without the model pulled, it waits
 * quietly.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, constants, copyFile, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { ask as askModel, modelReady } from "./ollama.mjs";
import { addFromNotice, courseList } from "./autopilot-notice.mjs";
import { importPortalShot } from "./portal-shot.mjs";
import { loadTopics, paperPages, readPaper } from "./paper-reader.mjs";
import { addAccepted, paperMeta, placePaper } from "./paper-dataset.mjs";
import { subjectShort } from "../../packages/core/src/subjectShort.ts";
import { INBOX, istClock } from "./inbox.mjs";
import { findGs } from "./shrink.mjs";
import { freeName } from "./deletions.mjs";

export const STATE_DIR = path.join(homedir(), "Library", "Application Support", "AcadKit", "autopilot");
/** Every decision Autopilot makes, one JSON line each (logDecision). */
export const DECISIONS = path.join(homedir(), "Library", "Logs", "AcadKit", "autopilot.jsonl");
const DECISIONS_MAX = 2 * 1024 * 1024;
const PHOTO = /\.(jpe?g|png|heic|heif|webp)$/i;
const PDF = /\.pdf$/i;
/** Each file takes the model 10-30 s; the rest wait for the next tick. */
const PER_TICK = 3;
/** The longest side a page is sent at: enough for a notice's small print. */
const SIDE = 1280;
const TEXT_CHARS = 3000;
/** How sure the model must be that a watched folder's file is study material before it is copied in. */
export const KEEP = 0.7;
/** A file written to this recently may still be downloading. */
const SETTLING_MS = 10_000;
/** Present while the menu bar has Autopilot paused. */
export const pausedFile = (stateDir = STATE_DIR) => path.join(stateDir, "paused");

/** Off in .env.local, or paused from the menu bar. */
export const isPaused = (env = process.env, stateDir = STATE_DIR) => env.AUTOPILOT === "off" || existsSync(pausedFile(stateDir));

/** A file the model can't read is tried this many ticks, then left to the other rules. */
const TRIES = 3;

export const KINDS = {
  notice: "an announcement, circular, message or schedule, or a screenshot of one: tests, exams, deadlines, holidays, timetable changes",
  notes: "handwritten or typed study notes",
  board: "a camera photo of a classroom whiteboard, blackboard or projector screen, taken in class",
  slides: "lecture slides",
  "question-paper": "a test or exam paper, or a page of one",
  assignment: "an assignment, worksheet or lab exercise to do",
  portal: "a screenshot of the university's student portal: an attendance or marks table",
  other: "anything else: receipts, forms, personal photos, memes",
};

export const readable = (name) => PHOTO.test(name) || PDF.test(name);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 60_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.trim().slice(0, 200)}`));
    });
  });
}

/**
 * What the model sees of a file: a photo as one JPEG (HEIC included, via
 * sips), a PDF as its first page and the text of its first two pages (via
 * Ghostscript, when installed).
 */
export async function pagesOf(full) {
  const tmp = await mkdtemp(path.join(tmpdir(), "acadkit-autopilot-"));
  try {
    if (PHOTO.test(full)) {
      const out = path.join(tmp, "page.jpg");
      await run("/usr/bin/sips", ["-s", "format", "jpeg", "-Z", String(SIDE), full, "--out", out]);
      return { images: [(await readFile(out)).toString("base64")], text: "" };
    }
    const gs = await findGs();
    if (!gs) return { images: [], text: "" };
    const png = path.join(tmp, "page.png");
    const txt = path.join(tmp, "text.txt");
    await run(gs, ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=png16m", "-r100", "-dFirstPage=1", "-dLastPage=1", `-sOutputFile=${png}`, full]);
    await run(gs, ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=txtwrite", "-dFirstPage=1", "-dLastPage=2", `-sOutputFile=${txt}`, full]).catch(() => {});
    const text = (await readFile(txt, "utf8").catch(() => "")).replace(/\s+/g, " ").trim().slice(0, TEXT_CHARS);
    return { images: [(await readFile(png)).toString("base64")], text };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export function whatIsSchema(subjects) {
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: Object.keys(KINDS) },
      subject: { type: ["string", "null"], enum: [...subjects.map((s) => s.code), null] },
      summary: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["kind", "subject", "summary", "confidence"],
    additionalProperties: false,
  };
}

export function whatIsPrompt({ name, text, subjects }) {
  return [
    `A university student saved this file ("${name}"). Their courses this semester:`,
    courseList(subjects),
    "",
    "Say what it is, in JSON:",
    `- kind, one of: ${Object.entries(KINDS)
      .map(([k, v]) => `"${k}" (${v})`)
      .join("; ")}.`,
    "- subject: the code of the course it belongs to, or null when it is for none or several.",
    "- summary: one specific line (which test, which topic, which dates).",
    "- confidence: from 0 to 1, how sure you are of the kind and the course.",
    ...(text ? ["", `Text on its first pages: ${text}`] : []),
  ].join("\n");
}

/** What one file is, from what pagesOf made of it: { kind, subject, summary, confidence }. */
export function whatIs({ name, page, subjects, ask = askModel }) {
  return ask({ prompt: whatIsPrompt({ name, text: page.text, subjects }), images: page.images, schema: whatIsSchema(subjects) });
}

const sha256 = async (full) => createHash("sha256").update(await readFile(full)).digest("hex");

/** What has been read, by content hash. */
export async function loadSeen(dir = STATE_DIR) {
  return JSON.parse(await readFile(path.join(dir, "seen.json"), "utf8").catch(() => "{}"));
}

async function saveSeen(seen, dir = STATE_DIR) {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "seen.json"), JSON.stringify(seen, null, 1));
}

/**
 * One line in the Mac's decision log: the file, what was decided, and how
 * sure the model was. Past 2 MB the log moves to autopilot.1.jsonl.
 */
export async function logDecision(entry, file = DECISIONS) {
  await mkdir(path.dirname(file), { recursive: true });
  const size = await stat(file).then((s) => s.size, () => 0);
  if (size > DECISIONS_MAX) await rename(file, file.replace(/\.jsonl$/, ".1.jsonl"));
  await appendFile(file, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

const datasetOf = (dir) => path.join(dir, "_src", "pyq_dataset");

/**
 * A past paper's questions and what it is, read for the dataset when the
 * paper is filed (scripts/lib/paper-dataset.mjs); null for a course the
 * dataset has no topics for.
 */
async function readPastPaper({ full, code, subjects, dir, ask, sha }) {
  const s = subjects.find((x) => x.code === code);
  const subject = subjectShort(s);
  const topics = (await loadTopics(datasetOf(dir)).catch(() => ({})))[subject];
  if (!topics?.length) return null;
  const sheet = await paperPages(full);
  const course = `${s.name} (${subject})`;
  const meta = await paperMeta({ page: sheet[0], course, ask });
  const questions = await readPaper({ full, course, topics, ask, pages: async () => sheet });
  return { subject, subjectCode: code, meta, questions, sha };
}

/** Read for good: answered, or tried as often as it will be. */
const done = (read) => !!read && (!!read.kind || read.tries >= TRIES);

/** "notice for OS (92%): OS FT-II on 29 Oct" */
export function describe(read, subjects) {
  const s = subjects.find((x) => x.code === read.subject);
  const course = s ? ` for ${s.short_name || s.code}` : "";
  return `${read.kind}${course} (${Math.round(read.confidence * 100)}%): ${read.summary}`;
}

/** The watched folders, from AUTOPILOT_FOLDERS (comma-separated, "~" for home). */
export function autopilotFolders(env = process.env, home = homedir()) {
  return (env.AUTOPILOT_FOLDERS ?? "")
    .split(",")
    .map((f) => f.trim().replace(/^~(?=$|\/)/, home))
    .filter(Boolean);
}

const isWaiting = (e) => e.isFile() && !/^[._~]/.test(e.name) && readable(e.name);

/** What waits in Inbox: what the name and the class times couldn't place (scripts/lib/inbox.mjs). */
async function inInbox(dir) {
  const inbox = path.join(dir, INBOX);
  const entries = await readdir(inbox, { withFileTypes: true }).catch(() => []);
  return entries.filter(isWaiting).map((e) => ({ name: e.name, full: path.join(inbox, e.name), where: INBOX }));
}

/**
 * Photos and PDFs saved at the top of a watched folder since Autopilot first
 * saw it: picking ~/Downloads doesn't read years of downloads. "Saved" is
 * the file's ctime: a download or an AirDrop can carry an old modified time,
 * and macOS moves the creation time back with it.
 */
export async function newInFolders(folders, { stateDir = STATE_DIR, now = Date.now() } = {}) {
  const file = path.join(stateDir, "folders.json");
  const since = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  const out = [];
  let first = false;
  for (const folder of folders) {
    if (!since[folder]) {
      since[folder] = now;
      first = true;
      continue;
    }
    for (const e of (await readdir(folder, { withFileTypes: true }).catch(() => [])).filter(isWaiting)) {
      const full = path.join(folder, e.name);
      const st = await stat(full);
      if (st.ctimeMs >= since[folder] && now - st.mtimeMs >= SETTLING_MS) out.push({ name: e.name, full, where: path.basename(folder), folder });
    }
  }
  if (first) {
    await mkdir(stateDir, { recursive: true });
    await writeFile(file, JSON.stringify(since, null, 1));
  }
  return out;
}

/**
 * A watched folder's file, copied into Inbox to be filed. It keeps its own
 * times, so Inbox's class-time rule sees when it arrived, not when it was copied.
 */
async function copyToInbox(f, dir) {
  const inbox = path.join(dir, INBOX);
  await mkdir(inbox, { recursive: true });
  const name = freeName(f.name, (n) => existsSync(path.join(inbox, n)), " (%d)");
  const to = path.join(inbox, name);
  await copyFile(f.full, to, constants.COPYFILE_FICLONE);
  const st = await stat(f.full);
  await utimes(to, st.atime, st.mtime);
  return name;
}

/**
 * Reads what is new in Inbox and the watched folders, a few files a tick,
 * and says what each is. A notice's tests and deadlines are added
 * (scripts/lib/autopilot-notice.mjs), and a watched folder's study material
 * is copied into Inbox. Returns the files read this tick, with what they are.
 */
export async function readNew({ supabase, pin, dir, folders = [], ask = askModel, pages = pagesOf, stateDir = STATE_DIR, log = console.log, decide = logDecision, perTick = PER_TICK, now = Date.now() }) {
  const candidates = [...(await inInbox(dir)), ...(await newInFolders(folders, { stateDir, now }))];
  if (!candidates.length) return [];
  const seen = await loadSeen(stateDir);
  // A file already read, unchanged where it was read, isn't hashed again.
  const known = new Set(Object.values(seen).filter(done).map((v) => v.key));
  const fresh = [];
  for (const f of candidates) {
    const st = await stat(f.full);
    const key = `${f.full}|${st.size}|${st.mtimeMs}`;
    if (known.has(key)) continue;
    const sha = await sha256(f.full);
    if (!done(seen[sha]) && !fresh.some((x) => x.sha === sha)) fresh.push({ ...f, sha, key });
  }
  if (!fresh.length) return [];

  const { data: subjects, error } = await supabase.from("subjects").select("id, code, name, short_name").eq("device_id", pin);
  if (error) throw new Error(`Couldn't read the subjects: ${error.message}`);
  const today = istClock(new Date(now)).date;
  const read = [];
  for (const f of fresh.slice(0, perTick)) {
    const file = `${f.where}/${f.name}`;
    try {
      const page = await pages(f.full);
      if (!page.images.length && !page.text) throw new Error("couldn't open it");
      const what = await whatIs({ name: f.name, page, subjects, ask });
      // The notice first: if adding its deadlines fails, nothing is copied and the file is tried again next tick.
      const notice = what.kind === "notice" && what.confidence >= KEEP ? await addFromNotice({ supabase, pin, source: file, page, subjects, today, ask }) : null;
      const portal = what.kind === "portal" && what.confidence >= KEEP ? await importPortalShot({ supabase, pin, source: file, page, subjects, today, ask }) : null;
      const paper = what.kind === "question-paper" && what.confidence >= KEEP && what.subject ? await readPastPaper({ full: f.full, code: what.subject, subjects, dir, ask, sha: f.sha }) : null;
      let decision = "read";
      if (f.folder) decision = what.kind !== "other" && what.confidence >= KEEP ? `copied to Inbox/${await copyToInbox(f, dir)}` : "left where it is";
      log(`  Autopilot: ${file} is ${describe(what, subjects)}${f.folder ? ` -> ${decision}` : ""}`);
      await decide({ file, decision, ...what });
      if (notice) {
        log(`  Autopilot: ${notice.said}`);
        await decide({ file, decision: `notice: ${notice.decision}`, confidence: notice.confidence, said: notice.said });
      }
      if (paper) {
        log(`  Autopilot: read ${paper.questions.length} questions from it, for the past papers`);
        await decide({ file, decision: `past paper: ${paper.questions.length} questions`, ...paper.meta });
      }
      if (portal) {
        log(`  Autopilot: ${portal.said}`);
        await decide({ file, decision: `portal: ${portal.attendance.length} courses, ${portal.marks.updated + portal.marks.added} marks, ${portal.dropped.length} left out`, said: portal.said });
      }
      seen[f.sha] = { name: f.name, key: f.key, from: f.folder ?? INBOX, ...what, ...(paper ? { paper } : {}), at: new Date().toISOString() };
      read.push({ ...f, ...what });
    } catch (err) {
      const tries = (seen[f.sha]?.tries ?? 0) + 1;
      seen[f.sha] = { name: f.name, key: f.key, tries, error: err.message, at: new Date().toISOString() };
      log(`  Autopilot: couldn't read ${file}: ${err.message}${tries < TRIES ? "" : " (giving up on it)"}`);
      await decide({ file, decision: tries < TRIES ? "failed" : "gave up", error: err.message });
    }
  }
  await saveSeen(seen, stateDir);
  return read;
}

/**
 * Autopilot's answer for an Inbox file, for its filing rules
 * (scripts/lib/inbox.mjs): what it is when the model was sure, null when it
 * wasn't or couldn't read it, and "wait" for a photo or PDF not read yet
 * while Autopilot is on and the model is there.
 */
export async function contentReader({ env = process.env, stateDir = STATE_DIR, ready = modelReady } = {}) {
  const on = !isPaused(env, stateDir) && (await ready());
  const seen = await loadSeen(stateDir);
  return async (full, name) => {
    if (!readable(name)) return null;
    const read = seen[await sha256(full)];
    if (done(read)) return read.kind && read.confidence >= KEEP ? read : null;
    return on ? "wait" : null;
  };
}

/**
 * Inbox's moves (fileInbox's onMove): logged when Autopilot's read placed
 * the file, and a past paper filed into 07_PYQs joins the dataset, or asks to.
 */
export function filer({ supabase, pin, dir, decide = logDecision, log = console.log }) {
  return async ({ name, to, read }) => {
    if (!read) return;
    await decide({ file: `${INBOX}/${name}`, decision: `filed to ${to}`, kind: read.kind, subject: read.subject, confidence: read.confidence });
    if (read.paper && to.includes("/07_PYQs/")) {
      const said = await placePaper({ supabase, pin, datasetDir: datasetOf(dir), reading: read.paper, file: to, sha: read.paper.sha });
      log(`  Autopilot: ${said}`);
      await decide({ file: `${INBOX}/${name}`, decision: "past paper", said });
    }
  };
}

/** The tick's Autopilot step: not while off or paused, and waiting while the model isn't there. */
/** Reads what's new, or says why it didn't: "paused", or "waiting for Ollama". */
export async function autopilot({ supabase, pin, dir, env = process.env, log = console.log }) {
  if (isPaused(env)) return "paused";
  if (!(await modelReady())) return "waiting for Ollama";
  await readNew({ supabase, pin, dir, folders: autopilotFolders(env), log });
  // Past papers I said yes to on Today.
  await addAccepted({ supabase, pin, datasetDir: datasetOf(dir), log });
}
