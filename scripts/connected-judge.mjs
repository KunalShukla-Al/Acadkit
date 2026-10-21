#!/usr/bin/env node
/**
 * Precision of links by meaning, by judging a sample of them
 * (scripts/lib/links.mjs).
 *
 * --sample: draws the links to judge, the same ones each time, spread
 *   over the pairs of kinds, and writes them with both items' text to
 *   ~/Library/Caches/AcadKit/eval/links-sample.json, for reading.
 * --score: reads the verdicts in eval/connected-links.tsv (from, to,
 *   pair, score, right as y or n) and writes EVAL.md's section on them.
 * --fresh, with either: 100 more from the links the app shows now, none
 *   of them judged before (links-sample-fresh.json), and their verdicts in
 *   eval/connected-links-fresh.tsv, scored in a section of their own.
 *
 * The study text stays on the Mac; the repo keeps only ids and verdicts.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpace } from "./lib/connected.mjs";
import { writeSection } from "./lib/eval-md.mjs";
import { deckPages } from "./lib/lecture-align.mjs";
import { freshReport, judgedReport, sampleLinks } from "./lib/links-judge.mjs";
import { linkByMeaning } from "./lib/links.mjs";
import { STUDY } from "./lib/paper-eval.mjs";
import { CACHE_DIR } from "./lib/semester.mjs";

const EVAL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "eval");
const VERDICTS = path.join(EVAL, "connected-links.tsv");
const FRESH_VERDICTS = path.join(EVAL, "connected-links-fresh.tsv");
const fresh = process.argv.includes("--fresh");
const SAMPLE = path.join(CACHE_DIR, "eval", fresh ? "links-sample-fresh.json" : "links-sample.json");

/** The verdicts in one of the TSVs, or none before it's written. */
async function verdicts(file) {
  const text = await readFile(file, "utf8").catch(() => "");
  return text.trim().split("\n").slice(1).filter(Boolean).map((l) => l.split("\t")).map(([from, to, pair, score, right]) => ({ from, to, pair, score: Number(score), right: right === "y" }));
}

if (process.argv.includes("--score")) {
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const judged = await verdicts(VERDICTS);
  if (!fresh) {
    await writeSection(judgedReport(judged, { date }));
    console.log(`Wrote the links' precision to EVAL.md (${judged.length} judged).`);
    process.exit(0);
  }
  const later = await verdicts(FRESH_VERDICTS);
  const over = judged.filter((j) => j.score >= 0.4);
  await writeSection(freshReport(later, { date, before: `${Math.round((over.filter((j) => j.right).length / over.length) * 100)}%` }));
  console.log(`Wrote the fresh links' precision to EVAL.md (${later.length} judged).`);
  process.exit(0);
}

const { items, means } = await buildSpace({ dir: STUDY });
const judgedBefore = new Set((await verdicts(VERDICTS)).map((j) => `${j.from}\t${j.to}`));
const picked = sampleLinks(linkByMeaning(items, means), items, fresh ? { total: 100, seed: 2027, exclude: judgedBefore } : { total: 100 });
const byId = new Map(items.map((i) => [i.id, i]));
const pages = new Map();
async function textOf(id) {
  const item = byId.get(id);
  if (item.kind === "question") return `${item.ref.label}: ${item.ref.text}`;
  if (!pages.has(item.ref.path)) pages.set(item.ref.path, await deckPages(path.join(STUDY, item.ref.path)));
  const text = pages.get(item.ref.path).find((p) => p.page === item.ref.page)?.text ?? "";
  return `${item.ref.path} p.${item.ref.page}: ${text.replace(/\s+/g, " ").slice(0, 500)}`;
}
const out = [];
for (const p of picked) out.push({ ...p, fromText: await textOf(p.from), toText: await textOf(p.to) });
await mkdir(path.dirname(SAMPLE), { recursive: true });
await writeFile(SAMPLE, JSON.stringify(out, null, 1));
console.log(`${out.length} links to judge, in ${SAMPLE}`);
