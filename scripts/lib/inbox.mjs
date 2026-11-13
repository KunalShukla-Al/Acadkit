/**
 * Filing what arrives in the study folder's Inbox: files shared from the
 * iPhone (the AcadKit Shortcut, the feeds' share endpoint) and saved there by
 * the Mac's upload step. Each goes where it belongs, by the first rule that
 * places it:
 *
 *   1. its name says the subject: a course code, or the subject's short name
 *      as a word ("OS_unit3.pdf") → <Subject>/02_Notes, in Unit_<n> when the
 *      name says a unit;
 *   2. it arrived during a class (the Day Order calendar and the timetable,
 *      from core's today()) → <Subject>/02_Notes/Class_Photos/<date>.
 *
 * Whatever no rule places stays in Inbox, on the Files page.
 */
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { today } from "../../packages/core/src/today.ts";
import { subjectShort } from "../../packages/core/src/subjectShort.ts";
import { freeName } from "./deletions.mjs";
import { readCourseTitles, subjectIndex, unitOf } from "./tags.mjs";

export const INBOX = "Inbox";
const CODE = /(?<![A-Za-z0-9])(\d{2}[A-Z]{3}\d{3}[A-Z])(?![A-Za-z0-9])/;
/** A class's photos are still "during" it this long after it ends. */
const AFTER_CLASS_MIN = 10;
const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** An instant's IST date and "HH:MM". */
export function istClock(at) {
  const date = at.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const time = at.toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false }).slice(0, 5);
  return { date, time };
}

/** The subject a file name names: its course code, or a short name as a whole word. */
export function subjectInName(name, subjects) {
  const code = CODE.exec(name)?.[1];
  if (code && subjects.some((s) => s.code === code)) return code;
  const words = new Set(name.replace(/\.[^.]+$/, "").split(/[^A-Za-z0-9]+/).filter(Boolean));
  const hit = subjects.find((s) => {
    const short = subjectShort(s);
    return short.length >= 2 && /^[A-Z0-9]+$/.test(short) && words.has(short);
  });
  return hit?.code ?? null;
}

/** The class on at `time` (until ten minutes after it ends), from a today() answer. */
export function classAt(classes, time) {
  const t = minutes(time);
  return classes.find((c) => t >= minutes(c.start) && t <= minutes(c.end) + AFTER_CLASS_MIN) ?? null;
}

/**
 * Where one file goes, relative to the study folder, or null to leave it.
 * `folderOf(code, type)` is the subject's top folder ("Operating_Systems",
 * the lab's for a lab class), or null.
 */
export function destinationFor({ name, at, classes, subjects, folderOf }) {
  const named = subjectInName(name, subjects);
  const unit = unitOf(name);
  if (named) {
    const folder = folderOf(named, "theory");
    if (folder) return [folder, "02_Notes", ...(unit ? [`Unit_${unit}`] : []), name].join("/");
  }
  const during = classAt(classes, at.time);
  if (during) {
    const folder = folderOf(during.code, during.type);
    if (folder) return [folder, "02_Notes", "Class_Photos", at.date, name].join("/");
  }
  return null;
}

/** Code → top folder: a lab class prefers the subject's lab folder ("…_Lab"). */
export function foldersByCode(index) {
  const byCode = new Map();
  for (const [folder, code] of index) {
    const list = byCode.get(code) ?? [];
    list.push(folder);
    byCode.set(code, list);
  }
  return (code, type) => {
    const list = byCode.get(code) ?? [];
    const lab = list.find((f) => /lab$/i.test(f));
    const theory = list.find((f) => !/lab$/i.test(f));
    return (type === "lab" ? lab ?? theory : theory ?? lab) ?? null;
  };
}

/** Every file waiting in Inbox, filed where the rules put it. Returns how many moved. */
export async function fileInbox({ supabase, pin, dir, log = console.log }) {
  const inbox = path.join(dir, INBOX);
  const waiting = (await readdir(inbox, { withFileTypes: true }).catch(() => [])).filter((e) => e.isFile() && !/^[._~]/.test(e.name));
  if (!waiting.length) return 0;

  const mine = (table) => supabase.from(table).select("*").eq("device_id", pin);
  const [settings, subjects, slots] = await Promise.all([mine("settings"), mine("subjects"), mine("timetable_slots")]);
  for (const r of [settings, subjects, slots]) if (r.error) throw new Error(`Couldn't read the timetable: ${r.error.message}`);
  const tops = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && !/^[._]/.test(e.name)).map((e) => e.name);
  const folderOf = foldersByCode(subjectIndex(tops, await readCourseTitles(dir)));

  let moved = 0;
  const days = new Map();
  for (const entry of waiting) {
    const from = path.join(inbox, entry.name);
    // When it arrived: the Mac saves a phone share a tick after it was shared.
    const at = istClock((await stat(from)).mtime);
    if (!days.has(at.date))
      days.set(at.date, today({ date: at.date, settings: settings.data[0] ?? null, subjects: subjects.data, slots: slots.data, attendance: [], snapshots: [], deadlines: [] }).classes);
    const rel = destinationFor({ name: entry.name, at, classes: days.get(at.date), subjects: subjects.data, folderOf });
    if (!rel) continue;
    const parent = path.join(dir, path.dirname(rel));
    const name = freeName(path.basename(rel), (n) => existsSync(path.join(parent, n)), " (%d)");
    await mkdir(parent, { recursive: true });
    await rename(from, path.join(parent, name));
    log(`  Inbox/${entry.name} → ${path.dirname(rel)}/${name}`);
    moved++;
  }
  return moved;
}
