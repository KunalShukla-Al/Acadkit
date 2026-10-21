#!/usr/bin/env node
/**
 * The past-paper reader (scripts/lib/paper-reader.mjs) on every paper I
 * labelled by hand (_src/pyq_dataset/papers.tsv): npm run autopilot:eval,
 * with Ollama running. Each paper's reading is kept on the Mac, by paper,
 * file hash, pages and reader version, so a run that stops picks up where
 * it was and a finished paper isn't read again. A paper in a file of
 * several is read only on its own pages (readPlan); one whose pages aren't
 * given is left out. `--subject OS` reads one course's, and `--score`
 * writes the scores into EVAL.md from the readings kept.
 *
 * The papers and what the model read of them stay on the Mac; only the
 * scores go in the repo (EVAL.md).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadTopics, paperPages, READER_VERSION, readPaper } from "./lib/paper-reader.mjs";
import { COURSES, DATASET, loadLabels, loadPapers, READINGS, readPlan, report, scorePaper, STUDY } from "./lib/paper-eval.mjs";
import { writeSection } from "./lib/eval-md.mjs";
import { MODEL, modelReady } from "./lib/ollama.mjs";

const { values } = parseArgs({ options: { subject: { type: "string" }, score: { type: "boolean" } } });

/** EVAL.md with the reader's section written (or replaced), the rest kept. */
async function writeScores() {
  const [papers, labels, topics] = [await loadPapers(), await loadLabels(), await loadTopics(DATASET)];
  const plan = readPlan(papers);
  const unitOf = (subject) => (topic) => topics[subject]?.find((t) => t.topic === topic)?.unit ?? null;
  const scores = [];
  const failed = [];
  const seconds = [];
  const skipped = papers.filter((p) => plan.get(p.paper).skip).map((p) => p.paper);
  let model = "";
  for (const p of papers) {
    if (plan.get(p.paper).skip) continue;
    const r = JSON.parse(await readFile(path.join(READINGS, `${p.paper}.json`), "utf8").catch(() => "null"));
    if (!r) {
      failed.push({ paper: p.paper, error: "not read yet" });
      continue;
    }
    model = r.model;
    seconds.push(r.seconds);
    if (r.error) failed.push({ paper: p.paper, error: r.error });
    scores.push({ subject: p.subject, kind: p.kind, score: scorePaper(labels[p.paper] ?? [], r.questions ?? [], unitOf(p.subject)) });
  }
  const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const section = report({ papers: papers.length - skipped.length, scores, failed, skipped, seconds, model, version: READER_VERSION, date });
  await writeSection(section);
  console.log(`Wrote the reader's scores to EVAL.md (${scores.length} papers).`);
}

if (values.score) {
  await writeScores();
  process.exit(0);
}
if (!(await modelReady())) {
  console.error(`Start Ollama and pull ${MODEL} first.`);
  process.exit(1);
}
const topics = await loadTopics(DATASET);
const all = await loadPapers();
const plan = readPlan(all);
const papers = all.filter((p) => !values.subject || p.subject === values.subject);
await mkdir(READINGS, { recursive: true });
let read = 0;
for (const [i, p] of papers.entries()) {
  const full = path.join(STUDY, p.file);
  const sha = createHash("sha256").update(await readFile(full).catch(() => Buffer.alloc(0))).digest("hex");
  const out = path.join(READINGS, `${p.paper}.json`);
  const { pages = null, skip } = plan.get(p.paper);
  if (skip) {
    console.log(`[${i + 1}/${papers.length}] ${p.paper}: left out, ${skip}`);
    continue;
  }
  const kept = JSON.parse(await readFile(out, "utf8").catch(() => "null"));
  // A paper read before, unchanged, is kept; one that failed (a timeout under load) is read again.
  if (kept && kept.sha === sha && kept.version === READER_VERSION && JSON.stringify(kept.pages ?? null) === JSON.stringify(pages) && !kept.error) continue;
  const started = Date.now();
  let result;
  try {
    const questions = await readPaper({ full, course: COURSES[p.subject] ?? p.subject, topics: topics[p.subject] ?? [], pages: (f) => paperPages(f, { only: pages }) });
    result = { questions };
  } catch (err) {
    result = { error: err.message };
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  await writeFile(out, JSON.stringify({ paper: p.paper, sha, pages, version: READER_VERSION, model: MODEL, seconds, ...result }));
  read++;
  console.log(`[${i + 1}/${papers.length}] ${p.paper}: ${result.error ? `couldn't read it (${result.error})` : `${result.questions.length} questions`} in ${seconds} s`);
}
console.log(`Read ${read} papers; the rest were read already. Readings: ${READINGS}`);
