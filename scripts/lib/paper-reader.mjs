/**
 * Autopilot's past-paper reader: a question paper (a PDF, a photo, or a
 * Word file the sync has made a PDF of) becomes its questions, each with
 * its part, number, marks, syllabus unit and topic, the same fields the
 * labelled dataset has (_src/pyq_dataset). The model reads a page at
 * a time: its text when the PDF has a text layer, its picture when not.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { ask as askModel } from "./ollama.mjs";
import { findGs } from "./shrink.mjs";

const RENDITIONS = path.join(homedir(), "Library", "Caches", "AcadKit", "renditions");
/** Changes when the prompt or the reading does, so a kept reading from before is read again. */
export const READER_VERSION = 2;
/** Papers run to four or five pages; past this, it's not one paper. */
const MAX_PAGES = 8;
/** A page with this much text is read as text, which is faster and exact. */
const TEXT_PAGE = 300;
/** A page of twenty MCQs is a long answer. */
const MAX_TOKENS = 4096;
/** The most questions one page's answer may list. */
const PAGE_MAX = 40;
/** SRM numbers a paper's questions from 1 to 32 at most; a higher number is one the model made up. */
const LAST_NUMBER = 32;
const SLOT = /^([ABC])(\d{1,2})([ab]?)(?:\.(\d))?$/;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (c) => (err += c));
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited ${code}: ${err.trim().slice(0, 200)}`));
    });
  });
}

/** The topics of each course, from the dataset's topics.tsv: { DSA: [{ topic, unit, name }] }. */
export async function loadTopics(datasetDir) {
  const rows = (await readFile(path.join(datasetDir, "topics.tsv"), "utf8")).trim().split("\n").slice(1).map((l) => l.split("\t"));
  const out = {};
  for (const [subject, topic, unit, name] of rows) (out[subject] ??= []).push({ topic, unit: Number(unit), name });
  return out;
}

/** A Word paper's PDF from the sync's conversions (scripts/lib/renditions.mjs), or null when there is none yet. */
async function renditionOf(full, dir = RENDITIONS) {
  const sha = createHash("sha256").update(await readFile(full)).digest("hex");
  const pdf = path.join(dir, `${sha}.pdf`);
  return existsSync(pdf) ? pdf : null;
}

/**
 * Each page as { page, image (base64 PNG or JPEG), text }: the first 8, or
 * with `only`, those pages by number (a paper inside a file of several).
 */
export async function paperPages(full, { renditions = RENDITIONS, only = null } = {}) {
  const ext = path.extname(full).toLowerCase();
  const tmp = await mkdtemp(path.join(tmpdir(), "acadkit-paper-"));
  try {
    if ([".jpg", ".jpeg", ".png", ".heic", ".webp"].includes(ext)) {
      const out = path.join(tmp, "page.jpg");
      await run("/usr/bin/sips", ["-s", "format", "jpeg", "-Z", "1600", full, "--out", out]);
      return [{ image: (await readFile(out)).toString("base64"), text: "" }];
    }
    const pdf = ext === ".pdf" ? full : [".doc", ".docx"].includes(ext) ? await renditionOf(full, renditions) : null;
    if (!pdf) throw new Error(ext === ".docx" || ext === ".doc" ? "the sync hasn't made a PDF of it yet" : `can't read ${ext} files`);
    const gs = await findGs();
    if (!gs) throw new Error("Ghostscript isn't installed");
    const first = only ? Math.min(...only) : 1;
    const last = only ? Math.max(...only) : MAX_PAGES;
    const base = ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", `-dFirstPage=${first}`, `-dLastPage=${last}`];
    await run(gs, [...base, "-sDEVICE=png16m", "-r110", `-sOutputFile=${path.join(tmp, "p-%02d.png")}`, pdf]);
    await run(gs, [...base, "-sDEVICE=txtwrite", `-sOutputFile=${path.join(tmp, "t-%02d.txt")}`, pdf]).catch(() => {});
    const images = (await readdir(tmp)).filter((f) => f.startsWith("p-")).sort();
    const sheet = await Promise.all(
      images.map(async (f, i) => ({
        page: first + i,
        image: (await readFile(path.join(tmp, f))).toString("base64"),
        text: (await readFile(path.join(tmp, `t-${String(i + 1).padStart(2, "0")}.txt`), "utf8").catch(() => "")).replace(/[ \t]+/g, " ").trim(),
      }))
    );
    return only ? sheet.filter((p) => only.includes(p.page)) : sheet;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export function paperSchema(topics) {
  return {
    type: "object",
    properties: {
      questions: {
        type: "array",
        // A page holds 20 at most; a model that starts counting on past the page stops here.
        maxItems: PAGE_MAX,
        items: {
          type: "object",
          properties: {
            // Checked and tidied in code (slotOf): a page isn't thrown away for one odd number.
            slot: { type: "string" },
            marks: { type: "integer", minimum: 1, maximum: 20 },
            topic: { type: ["string", "null"], enum: [...topics.map((t) => t.topic), null] },
          },
          required: ["slot", "marks", "topic"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  };
}

/**
 * `after`: the last question the pages before held, so a part that runs on
 * keeps its numbering. Only the number: told what that question was worth,
 * or told not to count on past the page, the model starts climbing the next
 * ones' marks (1, 2, 4, 5 for a part of 1-mark questions). A count run on
 * past the page is cut in code instead (PAGE_MAX, LAST_NUMBER).
 */
export function paperPrompt({ course, page, pages, topics, text, after = null }) {
  return [
    `This is page ${page} of ${pages} of an exam paper for ${course}, from SRM. List every question on it, in JSON.`,
    ...(after ? [`The pages before it ended at question ${after}; this page carries on from there.`] : []),
    '- slot: the part\'s letter and the question\'s number as the paper prints it: "A1" to "A20" in Part A, "B21" in Part B, "C26" in Part C. The two sides of an either/or are "a" and "b" ("B21a", "B21b"), and a numbered sub-question adds ".1", ".2" ("C26a.2").',
    "- marks: what the question is worth (the part's heading says, as in \"20 × 1 = 20 Marks\").",
    "- topic: the syllabus topic it asks about, by its code from this list, or null if none fits:",
    ...topics.map((t) => `  - ${t.topic}: ${t.name} (unit ${t.unit})`),
    "Leave out the instructions, the headers and the options of a multiple-choice question.",
    ...(text ? ["", `The page's text: ${text}`] : []),
  ].join("\n");
}

/** "B 21 (a)", "b21A" → "B21a"; null when it isn't a question number at all, or one past 32. */
export function slotOf(raw) {
  const m = /^([ABC])(\d{1,2})([AB]?)(?:\.(\d))?$/i.exec(String(raw).replace(/[\s()-]/g, ""));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > LAST_NUMBER) return null;
  return `${m[1].toUpperCase()}${m[2]}${m[3].toLowerCase()}${m[4] ? `.${m[4]}` : ""}`;
}

const order = (slot) => {
  const m = SLOT.exec(slot);
  return [m[1], Number(m[2]), m[3], Number(m[4] ?? 0)];
};
const compare = (a, b) => {
  const [x, y] = [order(a.slot), order(b.slot)];
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};

/**
 * The paper's questions, in order: { slot, part, number, marks, unit, topic }.
 * A slot read twice (a question run over a page break) keeps its first
 * reading, and one that isn't a question number is left out.
 */
export async function readPaper({ full, course, topics, ask = askModel, pages = paperPages }) {
  const sheet = await pages(full);
  const byUnit = new Map(topics.map((t) => [t.topic, t.unit]));
  const seen = new Map();
  for (const [i, p] of sheet.entries()) {
    const asText = p.text.length >= TEXT_PAGE;
    const after = [...seen.keys()].sort((a, b) => compare({ slot: a }, { slot: b })).at(-1) ?? null;
    const { questions } = await ask({
      prompt: paperPrompt({ course, page: i + 1, pages: sheet.length, topics, text: asText ? p.text : "", after }),
      images: asText ? [] : [p.image],
      schema: paperSchema(topics),
      maxTokens: MAX_TOKENS,
    });
    for (const q of questions) {
      const slot = slotOf(q.slot);
      if (slot && !seen.has(slot)) seen.set(slot, { ...q, slot });
    }
  }
  return [...seen.values()].sort(compare).map((q) => {
    const [part, number] = order(q.slot);
    return { slot: q.slot, part, number, marks: q.marks, unit: q.topic ? (byUnit.get(q.topic) ?? null) : null, topic: q.topic };
  });
}
