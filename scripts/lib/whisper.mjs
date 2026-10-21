/**
 * Speech to text on the Mac, with whisper.cpp (brew install whisper-cpp)
 * and its large-v3-turbo model, on the GPU through Metal. A recording is
 * made 16 kHz mono WAV first (macOS's afconvert), as whisper.cpp reads it.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const MODEL = path.join(homedir(), "Library", "Application Support", "AcadKit", "whisper", "ggml-large-v3-turbo.bin");
const CLI = ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"];
/** A lecture is an hour; whisper.cpp on Metal takes a few minutes of it. */
const TIMEOUT_MS = 60 * 60_000;

/** whisper-cli and the model, or what's missing. */
export function whisperReady(model = MODEL) {
  const cli = CLI.find((p) => existsSync(p)) ?? null;
  if (!cli) return { cli: null, missing: "whisper.cpp (brew install whisper-cpp)" };
  if (!existsSync(model)) return { cli, missing: `the model at ${model}` };
  return { cli, missing: null };
}

/** whisper.cpp's JSON as segments: { start, end } in seconds, and the text. */
export function segmentsOf(json) {
  return (json.transcription ?? [])
    .map((s) => ({ start: s.offsets.from / 1000, end: s.offsets.to / 1000, text: s.text.trim() }))
    .filter((s) => s.text && !/^\[.*\]$/.test(s.text));
}

/**
 * A recording as timed text. `lang` is whisper's ("en", or "auto" for a
 * class that mixes in Hindi). Returns { segments, seconds } (how long it took).
 */
export async function transcribe({ full, lang = "en", model = MODEL, run = execFileP, ready = whisperReady }) {
  const { cli, missing } = ready(model);
  if (missing) throw new Error(`can't transcribe without ${missing}`);
  const tmp = await mkdtemp(path.join(tmpdir(), "acadkit-whisper-"));
  const started = Date.now();
  try {
    const wav = path.join(tmp, "audio.wav");
    await run("/usr/bin/afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", full, wav]);
    const out = path.join(tmp, "out");
    await run(cli, ["-m", model, "-f", wav, "-l", lang, "-oj", "-of", out, "-np", "-t", "8"], { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
    const json = JSON.parse(await readFile(`${out}.json`, "utf8"));
    return { segments: segmentsOf(json), seconds: Math.round((Date.now() - started) / 1000) };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}
