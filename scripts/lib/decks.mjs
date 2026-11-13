/**
 * A course's slide decks, for Everything connected (scripts/lib/connected.mjs):
 * which files are decks, their slides' text and vectors, and centering.
 *
 * gte-small puts any two pages of one course close together (0.8 and more),
 * so vectors are compared less what the course's slides all share, their
 * mean taken off both (centerOn).
 *
 * Slide numbers are the pages the file viewer opens: an Office deck's are
 * its PDF rendition's (scripts/lib/renditions.mjs), when the sync has made
 * one.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cleanPage } from "../study-index/chunk.mjs";
import { embedTexts } from "../study-index/embed.mjs";
import { extractText } from "../study-index/text.mjs";
import { renditionPath } from "./renditions.mjs";
import { CACHE_DIR } from "./semester.mjs";

/** A slide with fewer letters is a title or a picture: nothing to match. */
const MIN_LETTERS = 40;
const VECTORS = path.join(CACHE_DIR, "slides");

/** Whether a file is a slide deck: a .pptx or .ppt, or a PDF named as slides. */
export const isDeck = (name) => /\.pptx?$/i.test(name) || (/\.pdf$/i.test(name) && /slide/i.test(name));

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
