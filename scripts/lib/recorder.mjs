/**
 * The class recorder: lectures I record with Voice Memos on the iPhone
 * reach this Mac through iCloud, and the tick picks each new one up here,
 * finds its class, transcribes it (scripts/lib/whisper.mjs) and lines it
 * up with the slides (scripts/lib/lecture-align.mjs), one a tick. The
 * audio and the transcripts stay on the Mac.
 *
 * Off until RECORDER=on in .env.local: recording a class needs the
 * teacher's say-so. Voice Memos keeps its files in a Group Container that
 * macOS guards, so the tick's /bin/bash needs Full Disk Access (it already
 * has it for the study folder).
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { today } from "../../packages/core/src/today.ts";
import { foldersByCode, istClock } from "./inbox.mjs";
import { alignLecture } from "./lecture-align.mjs";
import { readCourseTitles, subjectIndex } from "./tags.mjs";
import { transcribe, whisperReady } from "./whisper.mjs";

const execFileP = promisify(execFile);

export const VOICE_MEMOS = path.join(homedir(), "Library", "Group Containers", "group.com.apple.VoiceMemos.shared", "Recordings");
export const STATE_DIR = path.join(homedir(), "Library", "Application Support", "AcadKit", "recorder");
const AUDIO = /\.(m4a|qta|caf|wav)$/i;
/** iCloud may still be writing a memo this recent. */
const SETTLING_MS = 60_000;

export const isOn = (env = process.env) => env.RECORDER === "on";

/**
 * When a memo started, from its name ("20261103 101533-3F2A9C1B.m4a" is
 * 10:15:33 on 3 Nov, the Mac's local time), or null when the name doesn't say.
 */
export function startedAt(name) {
  const m = /^(\d{4})(\d{2})(\d{2}) (\d{2})(\d{2})(\d{2})/.exec(name);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) : null;
}

async function loadSeen(stateDir) {
  return JSON.parse(await readFile(path.join(stateDir, "seen.json"), "utf8").catch(() => "{}"));
}

export async function saveSeen(seen, stateDir = STATE_DIR) {
  await mkdir(stateDir, { recursive: true });
  await writeFile(path.join(stateDir, "seen.json"), JSON.stringify(seen, null, 1));
}

/**
 * The memos not handled yet, oldest first: { name, full, size, started }.
 * One iCloud is still writing waits for a later tick; one already handled,
 * unchanged, isn't offered again. Throws when the folder can't be read.
 */
export async function newMemos({ dir = VOICE_MEMOS, stateDir = STATE_DIR, now = Date.now() } = {}) {
  const seen = await loadSeen(stateDir);
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isFile() || !AUDIO.test(e.name)) continue;
    const full = path.join(dir, e.name);
    const st = await stat(full);
    if (now - st.mtimeMs < SETTLING_MS) continue;
    if (seen[e.name]?.size === st.size) continue;
    out.push({ name: e.name, full, size: st.size, started: (startedAt(e.name) ?? st.birthtime).toISOString() });
  }
  return { memos: out.sort((a, b) => a.started.localeCompare(b.started)), seen };
}

/** A recording's length in seconds, from macOS's afinfo; null when it can't tell. */
export async function durationOf(full, run = execFileP) {
  const { stdout } = await run("/usr/bin/afinfo", [full]).catch(() => ({ stdout: "" }));
  const m = /estimated duration:\s*([\d.]+)/.exec(stdout);
  return m ? Math.round(Number(m[1])) : null;
}

/** "1 h 02 min", "48 min", "18 s". */
export function minutesOf(seconds) {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.floor(seconds / 3600)} h ${String(Math.round((seconds % 3600) / 60)).padStart(2, "0")} min`;
}

const WARN_EVERY_MS = 6 * 3_600_000;
/** A lecture takes whisper a few minutes; the rest wait for later ticks. */
const PER_TICK = 1;

/** Says `line` at most once every six hours, by a stamp file in the state folder. */
async function warnOnce(stateDir, name, line, log) {
  const stamp = path.join(stateDir, name);
  const last = await stat(stamp).then((s) => s.mtimeMs, () => 0);
  if (Date.now() - last <= WARN_EVERY_MS) return;
  log(line);
  await mkdir(stateDir, { recursive: true });
  await writeFile(stamp, "");
}

/**
 * The tick's recorder step: off until RECORDER=on; new memos picked up, one
 * a tick, handled (`handle`: its class and transcript) and kept track of.
 * Without access to Voice Memos, or without whisper (`missing`), it says so
 * once every six hours and waits. A memo that fails is tried again.
 */
export async function recorder({ env = process.env, dir = VOICE_MEMOS, stateDir = STATE_DIR, log = console.log, handle = async () => ({}), missing = () => null, perTick = PER_TICK } = {}) {
  if (!isOn(env)) return [];
  const lacking = missing();
  if (lacking) {
    await warnOnce(stateDir, "warned-whisper", `  Recorder: waiting for ${lacking}`, log);
    return [];
  }
  let found;
  try {
    found = await newMemos({ dir, stateDir });
  } catch (err) {
    await warnOnce(stateDir, "warned-access", `  Recorder: can't read Voice Memos (${err.code ?? err.message}): give /bin/bash Full Disk Access, and turn on Voice Memos in iCloud on the iPhone and this Mac`, log);
    return [];
  }
  const { memos, seen } = found;
  const done = [];
  for (const m of memos.slice(0, perTick)) {
    const seconds = await durationOf(m.full);
    let more;
    try {
      more = await handle({ ...m, seconds });
    } catch (err) {
      log(`  Recorder: couldn't handle ${m.name}: ${err.message}; trying again next tick`);
      continue;
    }
    seen[m.name] = { size: m.size, started: m.started, seconds, at: new Date().toISOString(), ...more };
    const of = more.class ? ` → ${more.class.short} ${more.class.start}–${more.class.end}` : more.date ? " → no class then" : "";
    const text = more.words ? `, ${more.words} words in ${more.took} s` : "";
    const slides = more.deck ? `, ${more.onSlide} of ${more.moments} moments on ${path.basename(more.deck)}` : more.alignError ? ` (no slides: ${more.alignError})` : "";
    log(`  Recorder: picked up ${m.name}${seconds ? ` (${minutesOf(seconds)})` : ""}${of}${text}${slides}`);
    done.push({ ...m, seconds, ...more });
  }
  if (done.length) await saveSeen(seen, stateDir);
  return done;
}

const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * The class a recording is of: the day's class (core's today()) it
 * overlaps most, as long as it covers at least half the class or the
 * class covers half of it. Null for a recording out of class hours.
 */
export function classOf({ start, seconds, classes }) {
  const from = toMinutes(start);
  const to = from + Math.max(1, Math.round((seconds ?? 0) / 60));
  let best = null;
  for (const c of classes) {
    const [a, b] = [toMinutes(c.start), toMinutes(c.end)];
    const overlap = Math.min(to, b) - Math.max(from, a);
    if (overlap <= 0) continue;
    const enough = overlap >= (b - a) / 2 || overlap >= (to - from) / 2;
    if (enough && (!best || overlap > best.overlap)) best = { code: c.code, short: c.short, name: c.name, type: c.type, start: c.start, end: c.end, overlap };
  }
  if (!best) return null;
  const { overlap: _overlap, ...match } = best;
  return match;
}

/**
 * What the recorder does with each memo: finds its class on the Day Order
 * calendar (one timetable read per tick), transcribes it, lines it up with
 * the class's slides in the study folder `dir`, and keeps it all in the
 * state folder's transcripts/, named as the memo. Slides it can't line up
 * with (no embedder) leave the transcript as it is.
 */
export function handler({ supabase, pin, dir, env = process.env, stateDir = STATE_DIR, speech = transcribe, align = alignLecture }) {
  let timetable = null;
  let folderOf = null;
  return async (memo) => {
    if (!timetable) {
      const mine = (table) => supabase.from(table).select("*").eq("device_id", pin);
      const [settings, subjects, slots] = await Promise.all([mine("settings"), mine("subjects"), mine("timetable_slots")]);
      for (const r of [settings, subjects, slots]) if (r.error) throw new Error(`Couldn't read the timetable: ${r.error.message}`);
      timetable = { settings: settings.data[0] ?? null, subjects: subjects.data, slots: slots.data };
      const tops = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && !/^[._]/.test(e.name)).map((e) => e.name);
      folderOf = foldersByCode(subjectIndex(tops, await readCourseTitles(dir)));
    }
    const at = istClock(new Date(memo.started));
    const { classes } = today({ date: at.date, ...timetable, attendance: [], snapshots: [], deadlines: [] });
    const cls = classOf({ start: at.time, seconds: memo.seconds, classes });
    const { segments, seconds: took } = await speech({ full: memo.full, lang: env.RECORDER_LANG || "en" });

    let lined = { deck: null, moments: [] };
    let alignError = null;
    try {
      const { deck, moments, vectors } = await align({ dir, folder: cls ? folderOf(cls.code, cls.type) : null, segments });
      lined = { deck, moments: moments.map((m, i) => ({ ...m, vector: vectors[i] })) };
    } catch (err) {
      alignError = err.message;
    }

    const file = path.join(stateDir, "transcripts", `${memo.name.replace(/\.[^.]+$/, "")}.json`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ memo: memo.name, date: at.date, time: at.time, seconds: memo.seconds, class: cls, segments, ...lined }));
    const words = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    const onSlide = lined.moments.filter((m) => m.page).length;
    return { date: at.date, time: at.time, class: cls, transcript: file, words, took, deck: lined.deck, moments: lined.moments.length, onSlide, alignError };
  };
}

/** What the recorder still needs on this Mac: whisper.cpp and its model, or nothing. */
export const recorderMissing = () => whisperReady().missing;
