/**
 * The past-paper reader against my hand labels (_src/pyq_dataset): where
 * the papers and labels are, and where each paper's reading is kept
 * (scripts/autopilot-eval.mjs reads them).
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const STUDY = (process.env.STUDY_DIR || "~/Documents/SRM_Sem3").replace(/^~(?=$|\/)/, homedir());
export const DATASET = path.join(STUDY, "_src", "pyq_dataset");
export const READINGS = path.join(homedir(), "Library", "Caches", "AcadKit", "eval", "papers");
export const COURSES = {
  DSA: "Data Structures and Algorithms (DSA)",
  OS: "Operating Systems (OS)",
  TBVP: "Transforms and Boundary Value Problems (TBVP)",
  FDS: "Fundamentals of Data Science (FDS)",
  AOOP: "Advanced Object Oriented Programming (AOOP)",
};

/**
 * The pages a paper is on, from its note, for a file that holds more than
 * one paper: the first mention ("page 16", "pages 5–8 of the file", "pages
 * 8, 9, 11, 12", "pages 7 and 10"), and any later one the note adds to it
 * ("plus the Unit V MCQ page 4", "the MCQ page (13–14) is filed with this
 * set"), ranges filled in. Other mentions, such as a second copy, aren't
 * this paper's. Null when the note gives no pages.
 */
export function pagesOf(note) {
  const text = note ?? "";
  const mentions = [...text.matchAll(/\bpages? \(?(\d+(?:\s*(?:[–-]|,|and)\s*\d+)*)\)?/g)];
  if (!mentions.length) return null;
  const clauseOf = (m) => {
    const start = Math.max(text.lastIndexOf(";", m.index), text.lastIndexOf("(", m.index)) + 1;
    const end = text.indexOf(";", m.index);
    return { before: text.slice(start, m.index), after: text.slice(m.index, end === -1 ? undefined : end) };
  };
  const kept = mentions.filter((m, i) => i === 0 || /\bplus\b/.test(clauseOf(m).before) || /filed with this set/.test(clauseOf(m).after));
  const out = [];
  for (const m of kept)
    for (const part of m[1].split(/\s*(?:,|and)\s*/)) {
      const [a, b = a] = part.split(/\s*[–-]\s*/).map(Number);
      for (let n = a; n <= b; n++) if (!out.includes(n)) out.push(n);
    }
  return out.sort((x, y) => x - y);
}

/**
 * What to read of each paper: its own pages when its file holds others too,
 * else the whole file (null). A paper in a shared file whose note gives no
 * pages can't be told apart from the rest, so it's left out (`skip`).
 */
export function readPlan(papers) {
  const sharing = new Map();
  for (const p of papers) sharing.set(p.file, (sharing.get(p.file) ?? 0) + 1);
  return new Map(
    papers.map((p) => {
      if (sharing.get(p.file) === 1) return [p.paper, { pages: null }];
      const pages = pagesOf(p.note);
      return [p.paper, pages ? { pages } : { skip: "shares its file with other papers, and its pages aren't given" }];
    })
  );
}

/** papers.tsv as rows: { subject, paper, kind, file, … }. */
export async function loadPapers(datasetDir = DATASET) {
  const [head, ...rows] = (await readFile(path.join(datasetDir, "papers.tsv"), "utf8")).trim().split("\n").map((l) => l.split("\t"));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}


/** questions.tsv as { paper → [{ slot, marks, topic }] }. */
export async function loadLabels(datasetDir = DATASET) {
  const [, ...rows] = (await readFile(path.join(datasetDir, "questions.tsv"), "utf8")).trim().split("\n").map((l) => l.split("\t"));
  const out = {};
  for (const [, paper, slot, marks, topic] of rows) (out[paper] ??= []).push({ slot, marks: Number(marks), topic: topic || null });
  return out;
}

const numberOf = (slot) => /^[ABC](\d+)/.exec(slot)?.[1] ?? null;

/**
 * One paper's reading against its labels. A labelled question is found
 * when the reading has its slot; its part is right when the reading has a
 * question of that number in the same part. Marks, unit and topic are
 * compared on the found ones, the unit through the topics' units. Extra
 * is what the reading has that the labels don't.
 */
export function scorePaper(labels, reading, unitOf) {
  const bySlot = new Map(reading.map((q) => [q.slot, q]));
  const partOf = new Map(reading.map((q) => [numberOf(q.slot), q.slot[0]]));
  const s = { labelled: labels.length, read: reading.length, found: 0, part: 0, marks: 0, unit: 0, topic: 0, extra: 0 };
  for (const l of labels) {
    if (partOf.get(numberOf(l.slot)) === l.slot[0]) s.part++;
    const r = bySlot.get(l.slot);
    if (!r) continue;
    s.found++;
    if (r.marks === l.marks) s.marks++;
    if (r.topic === l.topic) s.topic++;
    if (l.topic && unitOf(l.topic) === r.unit) s.unit++;
  }
  const labelled = new Set(labels.map((l) => l.slot));
  s.extra = reading.filter((q) => !labelled.has(q.slot)).length;
  return s;
}

/** Scores summed: the fields add up, so a course's or the whole set's are the sum of its papers'. */
export function sum(scores) {
  const out = { papers: scores.length, labelled: 0, read: 0, found: 0, part: 0, marks: 0, unit: 0, topic: 0, extra: 0 };
  for (const s of scores) for (const k of Object.keys(s)) if (k in out && k !== "papers") out[k] += s[k];
  return out;
}

const pct = (n, of) => (of ? `${((100 * n) / of).toFixed(1)}%` : "–");

/**
 * EVAL.md's section on the reader, from each paper's score: the fields
 * over the whole set, then by course and by kind of paper.
 */
export function report({ papers, scores, failed, skipped = [], seconds, model, version, date }) {
  const n = (x) => x.toLocaleString("en-IN");
  const all = sum(scores.map((s) => s.score));
  const by = (key) => {
    const groups = new Map();
    for (const s of scores) groups.set(s[key], [...(groups.get(s[key]) ?? []), s.score]);
    return [...groups].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([k, list]) => [k, sum(list)]);
  };
  const row = (name, t) => `| ${name} | ${t.papers} | ${pct(t.found, t.labelled)} | ${pct(t.part, t.labelled)} | ${pct(t.marks, t.found)} | ${pct(t.unit, t.found)} | ${pct(t.topic, t.found)} |`;
  const head = ["| | Papers | Found | Part | Marks | Unit | Topic |", "| --- | --- | --- | --- | --- | --- | --- |"];
  const median = [...seconds].sort((a, b) => a - b)[Math.floor(seconds.length / 2)] ?? 0;
  return [
    "## Autopilot's past-paper reader",
    "",
    `\`scripts/lib/paper-reader.mjs\` (reader version ${version}, ${model} through Ollama on my Mac) on the ${papers} papers in`,
    `\`_src/pyq_dataset\` that I labelled by hand, ${all.labelled.toLocaleString("en-IN")} questions. Run on ${date} with \`npm run autopilot:eval\`.`,
    "",
    "| Field | Right | Of | Accuracy |",
    "| --- | --- | --- | --- |",
    `| Number: the question is found | ${n(all.found)} | ${n(all.labelled)} | ${pct(all.found, all.labelled)} |`,
    `| Part | ${n(all.part)} | ${n(all.labelled)} | ${pct(all.part, all.labelled)} |`,
    `| Marks, of those found | ${n(all.marks)} | ${n(all.found)} | ${pct(all.marks, all.found)} |`,
    `| Unit, of those found | ${n(all.unit)} | ${n(all.found)} | ${pct(all.unit, all.found)} |`,
    `| Topic, of those found | ${n(all.topic)} | ${n(all.found)} | ${pct(all.topic, all.found)} |`,
    "",
    `- It also read ${n(all.extra)} questions I didn't label (${pct(all.extra, all.read)} of what it read): sub-parts, and numbers misread.`,
    `- ${failed.length ? `It couldn't read ${failed.length} ${failed.length === 1 ? "paper" : "papers"}, which count as nothing found: ${failed.map((f) => `${f.paper} (${f.error})`).join("; ")}.` : "It read every paper."}`,
    ...(skipped.length
      ? [`- A paper in a file of several is read only on its own pages, from its note. ${skipped.length} share a file without saying which pages are theirs, so they're left out: ${skipped.join(", ")}.`]
      : []),
    `- A paper took ${median} s at the median, ${(seconds.reduce((a, b) => a + b, 0) / 3600).toFixed(1)} h in all.`,
    "- Found means the reading has the labelled slot (B21a, C26). Part is right when it has a question of that number in the same part. Marks, unit and topic are compared on the questions found; the unit comes from the topic.",
    "",
    "### By course",
    "",
    ...head,
    ...by("subject").map(([k, t]) => row(k, t)),
    "",
    "### By kind of paper",
    "",
    ...head,
    ...by("kind").map(([k, t]) => row(k === "end" ? "End-sem" : k === "ct" ? "Cycle test" : k, t)),
    "",
  ].join("\n");
}
