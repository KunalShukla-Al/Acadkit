#!/usr/bin/env node
/**
 * Records what the Mac's model says about a few of my real files, for the
 * replay test (scripts/lib/autopilot.replay.test.ts): `npm run
 * autopilot:record`, with Ollama running. Only the model's JSON replies are
 * kept, in scripts/lib/__fixtures__/autopilot-replies.json; the files stay
 * on the Mac. Re-record after changing a prompt or the model.
 */
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pagesOf, whatIs } from "./lib/autopilot.mjs";
import { noticePrompt, noticeSchema } from "./lib/autopilot-notice.mjs";
import { ask, MODEL, modelReady } from "./lib/ollama.mjs";

const STUDY = path.join(homedir(), "Documents", "SRM_Sem3");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(REPO, "scripts", "lib", "__fixtures__", "autopilot-replies.json");
/** The day the replies are recorded against: a notice's dates are read from it. */
const TODAY = "2026-10-19";

const SUBJECTS = [
  { id: "dsa", code: "21CSC201J", name: "Data Structures and Algorithms", short_name: "DSA" },
  { id: "os", code: "21CSC202J", name: "Operating Systems", short_name: "OS" },
  { id: "aoop", code: "21CSC203P", name: "Advanced Object Oriented and Programming", short_name: "AOOP" },
  { id: "tbvp", code: "21MAB201T", name: "Transforms and Boundary Value Problems", short_name: "TBVP" },
  { id: "fds", code: "21CSS202T", name: "Fundamentals of Data Science", short_name: "FDS" },
  { id: "uhv", code: "21LEM202T", name: "Universal Human Values II", short_name: "UHV" },
];

/** Each case: the name it arrives under in the test, and the file on this Mac. */
const CASES = [
  ["IMG_2041.png", path.join(STUDY, "00_General_Admin/05_WhatsApp/End_Sem_Subjects_List_Portal_(OS_now_30Nov)_AS1_UNOFFICIAL_6Oct.png")],
  ["IMG_2042.jpg", path.join(STUDY, "Advanced_Object_Oriented_Programming/07_PYQs/CT-1/2025_CT-1_SetC_Question_Paper_photo1.jpg")],
  ["notes_from_whatsapp.pdf", path.join(STUDY, "Operating_Systems/06_Notes_from_WhatsApp.pdf")],
  ["Unit2_Fourier_Series_Slides.pdf", path.join(STUDY, "Transforms_and_Boundary_Value_Problems/02_Notes/Unit_2/Unit2_Fourier_Series_Slides.pdf")],
  ["Assignment-1.pdf", path.join(STUDY, "Transforms_and_Boundary_Value_Problems/03_Assignments_Tutorials/Unit1_Assignment-1_PDE_(GradeX_NCR).pdf")],
  ["IMG_2043.png", path.join(REPO, "public/icons/icon-512.png")],
];

if (!(await modelReady())) {
  console.error(`Start Ollama and pull ${MODEL} first.`);
  process.exit(1);
}
const cases = [];
for (const [name, full] of CASES) {
  const page = await pagesOf(full);
  const read = await whatIs({ name, page, subjects: SUBJECTS });
  const notice = read.kind === "notice" ? await ask({ prompt: noticePrompt({ name, text: page.text, subjects: SUBJECTS, today: TODAY }), images: page.images, schema: noticeSchema(SUBJECTS) }) : null;
  console.log(`${name}: ${read.kind}, ${read.subject ?? "no course"} (${read.confidence})${notice ? `, ${notice.events.length} events` : ""}`);
  cases.push({ name, whatIs: read, ...(notice ? { notice } : {}) });
}
await writeFile(OUT, `${JSON.stringify({ model: MODEL, today: TODAY, subjects: SUBJECTS, cases }, null, 2)}\n`);
console.log(`Wrote ${path.relative(REPO, OUT)}`);
