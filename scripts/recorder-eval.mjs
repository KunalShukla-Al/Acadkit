#!/usr/bin/env node
/**
 * The class recorder's slide alignment on stand-in lectures
 * (scripts/lib/lecture-eval.mjs), on this Mac: the local model explains
 * each slide, `say` speaks the lecture, whisper.cpp transcribes it and the
 * recorder lines it up, as it would a real one. The scores go in EVAL.md;
 * the scripts, audio and moments stay in ~/Library/Caches/AcadKit/eval/lectures.
 * The explanations are kept, so a second run speaks the same lectures.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { alignLecture, deckPages, deckSlides, SLIDE_FLOOR } from "./lib/lecture-align.mjs";
import { writeSection } from "./lib/eval-md.mjs";
import { deckIs, explainPrompt, explainSchema, joinSpoken, LECTURES, pickSlides, report, scoreLecture, SCRIPT_VERSION, scriptOf, twinsOf, wavData, wavFile } from "./lib/lecture-eval.mjs";
import { ask, MODEL, modelReady } from "./lib/ollama.mjs";
import { STUDY } from "./lib/paper-eval.mjs";
import { CACHE_DIR } from "./lib/semester.mjs";
import { transcribe, whisperReady } from "./lib/whisper.mjs";

const run = promisify(execFile);
const OUT = path.join(CACHE_DIR, "eval", "lectures");
const COURSE = { Operating_Systems: "Operating Systems", Data_Structures_and_Algorithms: "Data Structures and Algorithms", Fundamentals_of_Data_Science: "Fundamentals of Data Science" };

if (whisperReady().missing) throw new Error(`can't run without ${whisperReady().missing}`);
if (!(await modelReady())) throw new Error(`Ollama isn't serving ${MODEL}`);
await mkdir(OUT, { recursive: true });

/** Each slide explained, kept after the first run. */
async function explanations(lecture) {
  const file = path.join(OUT, `${lecture.id}.script-v${SCRIPT_VERSION}.json`);
  const kept = JSON.parse(await readFile(file, "utf8").catch(() => "null"));
  if (kept) return kept;
  const picked = pickSlides(await deckPages(path.join(STUDY, lecture.deck)));
  const out = [];
  for (const s of picked) {
    const { said } = await ask({ prompt: explainPrompt(COURSE[lecture.course], s.text), schema: explainSchema, maxTokens: 900 });
    out.push({ page: s.page, said: said.trim() });
  }
  await writeFile(file, JSON.stringify(out, null, 1));
  return out;
}

/** The script spoken by `say`, one WAV, and when each piece was on. */
async function speak(lecture, pieces) {
  const tmp = path.join(OUT, `${lecture.id}-pieces`);
  await mkdir(tmp, { recursive: true });
  const spoken = [];
  for (const [i, p] of pieces.entries()) {
    const aiff = path.join(tmp, `${i}.aiff`);
    const wav = path.join(tmp, `${i}.wav`);
    await run("/usr/bin/say", ["-v", "Samantha", "-o", aiff, p.text]);
    await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
    spoken.push({ page: p.page, pcm: wavData(await readFile(wav)) });
  }
  await rm(tmp, { recursive: true, force: true });
  const { pcm, timeline } = joinSpoken(spoken);
  const file = path.join(OUT, `${lecture.id}.wav`);
  await writeFile(file, wavFile(pcm));
  return { file, timeline, seconds: Math.round(pcm.length / 2 / 16000) };
}

const results = [];
for (const lecture of LECTURES) {
  const pieces = scriptOf(await explanations(lecture));
  const { file, timeline, seconds } = await speak(lecture, pieces);
  // whisper's answer is kept with the script it heard, so changing the alignment re-runs only that.
  const heard = path.join(OUT, `${lecture.id}.segments-v${SCRIPT_VERSION}.json`);
  const { segments, seconds: took } = JSON.parse(await readFile(heard, "utf8").catch(() => "null")) ?? (await transcribe({ full: file }));
  await writeFile(heard, JSON.stringify({ segments, seconds: took }));
  const { deck, moments } = await alignLecture({ dir: STUDY, folder: lecture.course, segments });
  const trueSlides = await deckSlides(path.join(STUDY, lecture.deck));
  const twins = twinsOf(trueSlides, deck ? await deckSlides(path.join(STUDY, deck)) : [], deck === lecture.deck);
  const score = scoreLecture({ moments, timeline, twins });
  const which = deckIs({ deck: lecture.deck, chosen: deck, timeline, twins });
  results.push({ ...lecture, chosen: deck, deckIs: which, seconds, ...score });
  await writeFile(path.join(OUT, `${lecture.id}.json`), JSON.stringify({ ...lecture, chosen: deck, deckIs: which, seconds, took, score, timeline, moments }, null, 1));
  console.log(`${lecture.id}: ${Math.round(seconds / 60)} min, transcribed in ${took} s; deck ${which} (${deck}); ${score.right} of ${score.onSlide} on the right slide, ${score.keptOff} of ${score.asides} aside moments kept off`);
}

const date = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
await writeSection(report({ results, date, floor: SLIDE_FLOOR, whisper: "whisper.cpp large-v3-turbo", model: MODEL }));
console.log("Wrote the recorder's scores to EVAL.md.");
