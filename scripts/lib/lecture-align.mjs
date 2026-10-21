/**
 * A lecture's transcript lined up with the slides it was taught from
 * (scripts/lib/recorder.mjs). The transcript is cut into moments of about
 * a minute, and each moment gets a slide of the deck the lecture follows:
 * of the course's decks under 02_Notes, the one its moments match best, by
 * gte-small, the vectors study search uses.
 *
 * gte-small puts any minute of classroom talk close to any slide of the
 * course (0.8 and more): an aside about attendance scored 0.87 on a CPU
 * scheduling slide. So moments and slides are compared less what the
 * course's slides all share, their mean taken off both (centerOn). On the
 * stand-in lectures in EVAL.md that put 43% of moments on the right slide,
 * against 31% as they were.
 *
 * Slide numbers are the pages the file viewer opens: an Office deck's are
 * its PDF rendition's (scripts/lib/renditions.mjs), when the sync has made
 * one.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanPage } from "../study-index/chunk.mjs";
import { embedTexts } from "../study-index/embed.mjs";
import { extractText } from "../study-index/text.mjs";
import { renditionPath } from "./renditions.mjs";
import { CACHE_DIR } from "./semester.mjs";

/** About a minute of speech: enough words to match, short enough to point at one slide. */
const MOMENT_S = 60;
/**
 * A moment less like its slide than this, centered, is talk off the slides.
 * On the OS stand-in lecture, floors from 0.10 to 0.26 put the same moments
 * on the right slide, and higher ones only drop more; 0.2 sits in that range.
 */
export const SLIDE_FLOOR = 0.2;
/** A slide with fewer letters is a title or a picture: nothing to match. */
const MIN_LETTERS = 40;
const VECTORS = path.join(CACHE_DIR, "slides");

/** Whisper's segments as moments of about `span` seconds, cut between segments. */
export function momentsOf(segments, span = MOMENT_S) {
  const out = [];
  let cur = null;
  for (const s of segments) {
    if (cur && s.end - cur.start > span) {
      out.push(cur);
      cur = null;
    }
    cur ??= { start: s.start, end: s.end, text: "" };
    cur.end = s.end;
    cur.text = cur.text ? `${cur.text} ${s.text}` : s.text;
  }
  if (cur) out.push(cur);
  return out;
}

/** Whether a file is a slide deck: a .pptx or .ppt, or a PDF named as slides. */
export const isDeck = (name) => /\.pptx?$/i.test(name) || (/\.pdf$/i.test(name) && /slide/i.test(name));

/** A course's slide decks under 02_Notes, relative to the study folder. */
export async function slideDecks(dir, folder) {
  const out = [];
  async function walk(d) {
    for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (/^[._]/.test(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (isDeck(e.name)) out.push(path.relative(dir, full));
    }
  }
  await walk(path.join(dir, folder, "02_Notes"));
  return out.sort();
}

const sha256 = async (full) => createHash("sha256").update(await readFile(full)).digest("hex");
const letters = (s) => (s.match(/\p{L}/gu) ?? []).length;

/**
 * A deck's slides with text, as { page, text }: from the viewer's PDF of
 * it when there is one. A .ppt the sync hasn't made a PDF of has none.
 */
export async function deckPages(full, { read = extractText, renditions, sha } = {}) {
  sha ??= await sha256(full);
  const ext = path.extname(full).slice(1).toLowerCase();
  const pdf = ext === "pdf" ? null : renditionPath(sha, ext, renditions);
  let pages = [];
  if (pdf && existsSync(pdf)) pages = (await read(pdf, "pdf", await sha256(pdf))).pages;
  else if (ext !== "ppt") pages = (await read(full, ext, sha)).pages;
  return pages.map((text, i) => ({ page: i + 1, text: cleanPage(text) })).filter((s) => letters(s.text) >= MIN_LETTERS);
}

/** A deck's slides with text, as { page, vector }; vectors cached by the deck's content. */
export async function deckSlides(full, { embed = embedTexts, read = extractText, cacheDir = VECTORS, renditions } = {}) {
  const sha = await sha256(full);
  const cached = path.join(cacheDir, `${sha}.json`);
  if (existsSync(cached)) return JSON.parse(await readFile(cached, "utf8"));
  const slides = await deckPages(full, { read, renditions, sha });
  const vectors = slides.length ? await embed(slides.map((s) => s.text)) : [];
  const out = slides.map((s, i) => ({ page: s.page, vector: vectors[i] }));
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cached, JSON.stringify(out));
  return out;
}

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const unit = (v) => {
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
};

/** The mean of some vectors. */
export function meanOf(vectors) {
  const out = new Array(vectors[0]?.length ?? 0).fill(0);
  for (const v of vectors) for (let i = 0; i < v.length; i++) out[i] += v[i] / vectors.length;
  return out;
}

/** A vector less `mean`, as a unit vector again. */
export const centerOn = (mean) => (v) => unit(v.map((x, i) => x - mean[i]));

/**
 * Each moment's slide, in teaching order: of every way through the deck
 * that never goes back, the one whose moments are most like their slides.
 * A moment under the floor is off the slides: it scores nothing, so it
 * doesn't pull the place in the deck, and gets no slide. Returns `score`,
 * the way's total over the floor, and each moment's { page, similarity }.
 */
export function alignMoments(vectors, slides, floor = SLIDE_FLOOR) {
  if (!vectors.length || !slides.length) return { score: 0, aligned: vectors.map(() => ({ page: null, similarity: null })) };
  const sim = vectors.map((v) => slides.map((s) => dot(v, s.vector)));
  const gain = (w, s) => Math.max(0, sim[w][s] - floor);
  let best = slides.map((_, s) => gain(0, s));
  const back = [];
  for (let w = 1; w < vectors.length; w++) {
    const next = new Array(slides.length);
    const from = new Array(slides.length);
    let lead = 0;
    for (let s = 0; s < slides.length; s++) {
      if (best[s] > best[lead]) lead = s;
      next[s] = best[lead] + gain(w, s);
      from[s] = lead;
    }
    back.push(from);
    best = next;
  }
  let s = best.indexOf(Math.max(...best));
  const score = best[s];
  const way = new Array(vectors.length);
  for (let w = vectors.length - 1; w >= 0; w--) {
    way[w] = s;
    if (w > 0) s = back[w - 1][s];
  }
  const round = (x) => Math.round(x * 1000) / 1000;
  return { score, aligned: way.map((s, w) => (sim[w][s] >= floor ? { page: slides[s].page, similarity: round(sim[w][s]) } : { page: null, similarity: null })) };
}

/**
 * A transcript lined up with its course's slides: { deck, moments }, where
 * deck is the study-folder path of the deck it follows (null when none
 * fits) and each moment is { start, end, text, page, similarity }.
 * `vectors` are the moments' gte-small vectors, for search.
 */
export async function alignLecture({ dir, folder, segments, embed = embedTexts, read = extractText, cacheDir, renditions, floor = SLIDE_FLOOR }) {
  const moments = momentsOf(segments);
  const decks = folder ? await slideDecks(dir, folder) : [];
  const vectors = moments.length ? await embed(moments.map((m) => m.text)) : [];
  const course = [];
  for (const rel of decks) course.push({ rel, slides: await deckSlides(path.join(dir, rel), { embed, read, cacheDir, renditions }) });
  const all = course.flatMap((d) => d.slides.map((s) => s.vector));
  const center = all.length ? centerOn(meanOf(all)) : (v) => v;
  const heard = vectors.map(center);
  let best = null;
  for (const { rel, slides } of course) {
    const { score, aligned } = alignMoments(heard, slides.map((s) => ({ page: s.page, vector: center(s.vector) })), floor);
    if (score > 0 && (!best || score > best.score)) best = { rel, score, aligned };
  }
  return {
    deck: best?.rel ?? null,
    moments: moments.map((m, i) => ({ ...m, ...(best?.aligned[i] ?? { page: null, similarity: null }) })),
    vectors,
  };
}
