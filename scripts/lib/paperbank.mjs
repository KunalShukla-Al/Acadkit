/**
 * What the past-paper export `<folder>/_src/acadkit_paperbank.json` says about a study folder's past
 * papers:
 *
 *   files      each past-paper file's syllabus status (current / old syllabus / another course's
 *              paper) and how well its scan could be read
 *   questions  its questions, read with the paper's layout: no Marks/BL/CO numbers in the text,
 *              MCQ options kept apart, one entry per either/or half
 *   prereqs    the earlier units each of the folder's units leans on
 *
 * The export is fixed: nothing regenerates it, so a paper filed after 12 Oct 2026 has no entry.
 * Absent file, absent data: the sync works the same without it.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

/** One question as practice text: the question, then its options on one line. */
export function questionText(q) {
  const opts = (q.options ?? []).filter((o) => String(o).trim());
  return opts.length ? `${q.text} ${opts.map((o, i) => `(${"ABCD"[i]}) ${o}`).join(" ")}` : q.text;
}

/** `[{ root, prefix }]` (prefix "" or "SRM_Sem4/") → merged maps, paths as the manifest writes them. */
export async function readPaperbank(roots, { log = console.log } = {}) {
  const files = new Map();
  const questions = new Map();
  const prereqs = new Map();
  for (const { root, prefix } of roots) {
    let data;
    try {
      data = JSON.parse(await readFile(path.join(root, "_src", "acadkit_paperbank.json"), "utf8"));
    } catch {
      continue;
    }
    for (const [rel, f] of Object.entries(data.files ?? {})) {
      files.set(`${prefix}${rel}`, { status: f.status, quality: f.read?.quality ?? null, year: f.year ?? null, kind: f.kind ?? null });
    }
    for (const q of data.questions ?? []) {
      // End-sem papers only: printed and scanned flat, they are what it reads best (93% of question
      // numbers found). CT answer keys mix solutions into the text; there the old splitter stays.
      if (!q.file || !q.text?.trim() || q.kind !== "end_sem") continue;
      const key = `${prefix}${q.file}`;
      if (!questions.has(key)) questions.set(key, []);
      questions.get(key).push(questionText(q));
    }
    for (const link of data.prereqs ?? []) prereqs.set(`${link.course}|${link.unit ?? ""}`, link);
    log(`Paperbank (${path.basename(root)}): ${Object.keys(data.files ?? {}).length} past-paper files, ${(data.questions ?? []).length} questions`);
  }
  return { files, questions, prereqs: [...prereqs.values()] };
}

/** The manifest's note on a past-paper file, only when there is something to say. */
export function pyqNote(info) {
  if (!info) return null;
  const note = {};
  if (info.status && info.status !== "current") note.status = info.status;
  if (info.quality && info.quality !== "good") note.quality = info.quality;
  return Object.keys(note).length ? note : null;
}
