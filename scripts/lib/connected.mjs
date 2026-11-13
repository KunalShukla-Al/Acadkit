/**
 * Everything connected: what I study from, in one embedding space (gte-small,
 * the vectors study search uses), so any item can point at the others about
 * the same thing.
 *
 * | Kind     | What it is                                         | Opens           |
 * | -------- | -------------------------------------------------- | --------------- |
 * | page     | a page of notes: a PDF or document that isn't a deck | the file there |
 * | slide    | a slide of a deck (scripts/lib/decks.mjs)          | the deck there  |
 * | question | a past-paper question (`_src/pyq_dataset`)          | the paper       |
 * | photo    | a board photo's text, by OCR (`02_Notes/Class_Photos`) | the photo    |
 *
 * Every item has its course (the study folder's top folder), its unit when
 * the folder or the question's topic says, and a photo the time it was
 * taken. Vectors are cached by content, as the slides' are.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanPage } from "../study-index/chunk.mjs";
import { embedTexts } from "../study-index/embed.mjs";
import { extractText } from "../study-index/text.mjs";
import { istClock } from "./inbox.mjs";
import { deckSlides, isDeck, meanOf } from "./decks.mjs";
import { CACHE_DIR } from "./semester.mjs";
import { readCourseTitles, subjectIndex, unitOf } from "./tags.mjs";

export const KINDS = ["page", "slide", "question", "photo"];
const CACHE = path.join(CACHE_DIR, "connected");
const DOCUMENT = /\.(pdf|docx?|pptx?)$/i;
const PHOTO = /\.(jpe?g|png|heic)$/i;
/** A photo with fewer letters than this is a picture, not writing on a board. */
const MIN_PHOTO_LETTERS = 20;

const sha24 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 24);
const letters = (s) => (s.match(/\p{L}/gu) ?? []).length;

/** The top folders that are courses (a course code, as the sync tags them): not Inbox, Syllabi or admin. */
export async function courseFolders(dir) {
  const tops = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory() && !/^[._~]/.test(e.name)).map((e) => e.name);
  return [...subjectIndex(tops, await readCourseTitles(dir)).keys()].sort();
}

/**
 * The courses' files, relative to the study folder: not hidden ones, and
 * not past papers (07_PYQs), which their questions stand for.
 */
export async function courseFiles(dir) {
  const out = [];
  async function walk(rel) {
    for (const e of await readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => [])) {
      if (/^[._~]|^07_PYQs$/.test(e.name)) continue;
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(child);
      else out.push(child);
    }
  }
  for (const course of await courseFolders(dir)) await walk(course);
  return out.sort();
}

/** "Operating_Systems/02_Notes/Unit_3/x.pdf" → its course and unit. */
const placeOf = (rel) => ({ course: rel.split("/")[0], unit: unitOf(rel.split("/").slice(1, -1).join("/")) ?? unitOf(path.basename(rel)) });

/** A board photo's time: its Class_Photos/<date> folder's date and the file's clock, IST. */
async function photoTime(dir, rel) {
  const date = /Class_Photos\/(\d{4}-\d{2}-\d{2})\//.exec(rel)?.[1];
  const clock = istClock((await stat(path.join(dir, rel))).mtime);
  return `${date ?? clock.date}T${clock.time}`;
}

/** Pages, slides and board photos, from the study folder's files. */
export async function fileItems({ dir, embed = embedTexts, read = extractText, cacheDir, files }) {
  const items = [];
  for (const rel of files ?? (await courseFiles(dir))) {
    const full = path.join(dir, rel);
    const where = placeOf(rel);
    if (DOCUMENT.test(rel)) {
      const kind = isDeck(path.basename(rel)) ? "slide" : "page";
      for (const s of await deckSlides(full, { embed, read, cacheDir })) items.push({ id: `${kind}:${rel}#${s.page}`, kind, ...where, ref: { path: rel, page: s.page }, vector: s.vector });
    } else if (PHOTO.test(rel) && rel.includes("/Class_Photos/")) {
      const sha = createHash("sha256").update(await readFile(full)).digest("hex");
      const text = cleanPage((await read(full, path.extname(rel).slice(1).toLowerCase(), sha)).pages.join("\n"));
      if (letters(text) < MIN_PHOTO_LETTERS) continue;
      const [vector] = await cachedVectors([text], { embed, file: path.join(cacheDir ?? CACHE, "photos.json") });
      items.push({ id: `photo:${rel}`, kind: "photo", ...where, ref: { path: rel }, vector, at: await photoTime(dir, rel) });
    }
  }
  return items;
}

/** Vectors for texts, from a cache file keyed by text; new texts are embedded and kept. */
async function cachedVectors(texts, { embed, file }) {
  const cache = JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
  const missing = [...new Set(texts.filter((t) => !cache[sha24(t)]))];
  if (missing.length) {
    const vectors = await embed(missing);
    missing.forEach((t, i) => (cache[sha24(t)] = vectors[i]));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(cache));
  }
  return texts.map((t) => cache[sha24(t)]);
}

const tsv = async (file) => {
  const [head, ...rows] = (await readFile(file, "utf8")).trim().split("\n").map((l) => l.split("\t"));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "End-sem Dec 2025" or "CT-1 Sep 2026", from a papers.tsv row. */
export function paperLabel(p) {
  const [y, m] = (p.date ?? "").split("-").map(Number);
  const when = y && m ? ` ${MONTHS[m - 1]} ${y}` : "";
  return `${p.kind === "end" ? "End-sem" : p.test || "Test"}${when}`;
}

/**
 * Past-paper questions with their text, each in the course folder its
 * paper is filed in; `ref` has the paper's file, a label and the text, for
 * the app to show and match against the questions it lists.
 */
export async function questionItems({ datasetDir, embed = embedTexts, cacheDir }) {
  if (!existsSync(path.join(datasetDir, "questions.tsv"))) return [];
  const papers = new Map((await tsv(path.join(datasetDir, "papers.tsv"))).map((p) => [p.paper, p]));
  const folderOf = new Map([...papers].map(([id, p]) => [id, p.file?.split("/")[0]]));
  const unitOfTopic = new Map((await tsv(path.join(datasetDir, "topics.tsv")).catch(() => [])).map((t) => [`${t.subject}:${t.topic}`, Number(t.unit) || null]));
  const rows = (await tsv(path.join(datasetDir, "questions.tsv"))).filter((q) => letters(q.text) >= 10 && folderOf.get(q.paper));
  const vectors = await cachedVectors(rows.map((q) => q.text), { embed, file: path.join(cacheDir ?? CACHE, "questions.json") });
  return rows.map((q, i) => ({
    id: `question:${q.paper}#${q.slot}`,
    kind: "question",
    course: folderOf.get(q.paper),
    unit: unitOfTopic.get(`${q.subject}:${q.topic}`) ?? null,
    ref: { paper: q.paper, slot: q.slot, path: papers.get(q.paper).file, label: `${paperLabel(papers.get(q.paper))} · ${q.slot}`, text: q.text },
    vector: vectors[i],
  }));
}

/** The whole space: every item, and each course's mean vector (what its items all share, for centering). */
export async function buildSpace({ dir, datasetDir = path.join(dir, "_src", "pyq_dataset"), embed = embedTexts, read = extractText, cacheDir }) {
  const items = [
    ...(await fileItems({ dir, embed, read, cacheDir })),
    ...(await questionItems({ datasetDir, embed, cacheDir })),
  ];
  const means = {};
  for (const course of new Set(items.map((i) => i.course).filter(Boolean))) means[course] = meanOf(items.filter((i) => i.course === course).map((i) => i.vector));
  return { items, means };
}

/** How many of each kind, by course: "Operating_Systems: 2,104 pages · 310 slides · 412 questions". */
export function spaceSummary(items) {
  const by = new Map();
  for (const i of items) {
    const c = by.get(i.course) ?? Object.fromEntries(KINDS.map((k) => [k, 0]));
    c[i.kind]++;
    by.set(i.course, c);
  }
  return [...by].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([course, c]) => `${course}: ${KINDS.filter((k) => c[k]).map((k) => `${c[k].toLocaleString("en-IN")} ${k}${c[k] === 1 ? "" : "s"}`).join(" · ")}`);
}
