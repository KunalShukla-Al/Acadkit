/**
 * A past paper Autopilot read (scripts/lib/paper-reader.mjs) joining my
 * labelled dataset (_src/pyq_dataset): papers.tsv gets the paper and
 * questions.tsv its questions, the way I label them. A reading that looks
 * right joins at once; one that doesn't asks first, as a suggestion on Today
 * (kind "paper", migration 060), and joins once I say yes.
 */
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { ask as askModel } from "./ollama.mjs";

/** Fewer questions than this is a page or two, not a paper. */
const MIN_QUESTIONS = 10;
/** More questions than this with no topic, and the reading isn't trusted. */
const MAX_UNTOPICED = 0.2;

export function metaSchema() {
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["end", "ct"] },
      test: { type: "string" },
      date: { type: ["string", "null"] },
    },
    required: ["kind", "test", "date"],
    additionalProperties: false,
  };
}

export function metaPrompt(course) {
  return [
    `This is the first page of an exam paper for ${course}, from SRM. Say, in JSON:`,
    '- kind: "end" for an end-semester exam, "ct" for a cycle test or other internal test.',
    '- test: as the paper names it, short ("CT-1", "FT-II", "CLA-2"); "END" for an end-semester exam.',
    '- date: the exam\'s month as "YYYY-MM", or null when the paper doesn\'t say.',
  ].join("\n");
}

/** What the paper is: { kind, test, date }, read off its first page. */
export function paperMeta({ page, course, ask = askModel }) {
  const text = page.text.length >= 300 ? page.text : "";
  return ask({ prompt: `${metaPrompt(course)}${text ? `\n\nThe page's text: ${text}` : ""}`, images: text ? [] : [page.image], schema: metaSchema() });
}

/** Why a reading isn't to be trusted without asking: none, when it looks right. */
export function doubts(questions, meta) {
  const out = [];
  if (questions.length < MIN_QUESTIONS) out.push(`only ${questions.length} questions read`);
  const untopiced = questions.filter((q) => !q.topic).length;
  if (questions.length && untopiced / questions.length > MAX_UNTOPICED) out.push(`${untopiced} without a topic`);
  const numbers = [...new Set(questions.map((q) => q.number))].sort((a, b) => a - b);
  const missing = [];
  for (let n = numbers[0]; n < numbers.at(-1); n++) if (!numbers.includes(n)) missing.push(n);
  if (missing.length) out.push(`no question ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`);
  if (!meta.date) out.push("no date on it");
  return out;
}

const tsv = (cells) => `${cells.map((c) => String(c ?? "").replace(/[\t\n]/g, " ")).join("\t")}\n`;

/** "os-ct1-2026-09", "dsa-es-2024-05"; with "-2", "-3" when that one is taken. */
export function paperId(subject, meta, taken) {
  const test = meta.kind === "end" ? "es" : meta.test.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const base = [subject.toLowerCase(), test, meta.date ?? "undated"].join("-");
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/**
 * Adds a paper and its questions to the dataset, unless its file is there
 * already. Returns the paper's id, or null when it was there.
 */
export async function addToDataset({ datasetDir, subject, meta, file, questions }) {
  const papers = (await readFile(path.join(datasetDir, "papers.tsv"), "utf8")).trim().split("\n").slice(1).map((l) => l.split("\t"));
  if (papers.some((p) => p[9] === file)) return null;
  const id = paperId(subject, meta, new Set(papers.map((p) => p[1])));
  const session = `${meta.kind === "end" ? "END" : meta.test} ${meta.date ?? ""}`.trim();
  await appendFile(path.join(datasetDir, "papers.tsv"), tsv([subject, id, meta.kind, meta.kind === "end" ? "END" : meta.test, session, meta.date ?? "", "-", "main", "-", file, "read by Autopilot"]));
  await appendFile(path.join(datasetDir, "questions.tsv"), questions.map((q) => tsv([subject, id, q.slot, q.marks, q.topic ?? "", "", ""])).join(""));
  return id;
}

/**
 * A paper Autopilot filed into 07_PYQs: into the dataset now when the
 * reading looks right, or offered on Today when it doesn't. Returns a line
 * saying which.
 */
export async function placePaper({ supabase, pin, datasetDir, reading, file, sha }) {
  const { subject, subjectCode, meta, questions } = reading;
  const doubt = doubts(questions, meta);
  if (!doubt.length) {
    const id = await addToDataset({ datasetDir, subject, meta, file, questions });
    return id ? `Added ${file} to the past papers as ${id}, ${questions.length} questions.` : `${file} is in the past papers already.`;
  }
  const payload = { subject_code: subjectCode, subject, file, meta, questions, doubts: doubt };
  const { error } = await supabase
    .from("suggestions")
    .upsert({ device_id: pin, key: `paper:${sha}`, kind: "paper", payload, source: file, evidence: doubt.join("; "), status: "pending" }, { onConflict: "device_id,key", ignoreDuplicates: true });
  if (error) throw new Error(`Couldn't ask about ${file}: ${error.message}`);
  return `Asked before adding ${file} to the past papers: ${doubt.join("; ")}.`;
}

/** Papers I said yes to on Today, into the dataset. Returns the ones added. */
export async function addAccepted({ supabase, pin, datasetDir, log = console.log }) {
  const { data, error } = await supabase.from("suggestions").select("id, payload").eq("device_id", pin).eq("kind", "paper").eq("status", "accepted");
  if (error) throw new Error(`Couldn't read the papers to add: ${error.message}`);
  const added = [];
  for (const s of data ?? []) {
    const p = s.payload;
    const id = await addToDataset({ datasetDir, subject: p.subject, meta: p.meta, file: p.file, questions: p.questions });
    if (id) {
      added.push(id);
      log(`  Autopilot: added ${p.file} to the past papers as ${id}, as you said.`);
    }
  }
  return added;
}
