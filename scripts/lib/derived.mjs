/**
 * Whether the sync's derived files, units.json and topics.json, need
 * building again. They take most of a sync (48 of 50 s on Sem 3: syllabus
 * PDFs, every past paper, a search per unit and per topic), yet they only
 * change when what they're built from does:
 *
 *   - the files, by path, content and tags;
 *   - the syllabi (_src/acadkit_syllabi.json);
 *   - the search index, which changes only when this run indexed or
 *     dropped something;
 *   - the code that builds them;
 *   - the switches that change how (STUDY_PAPERBANK_QUESTIONS).
 *
 * The first, second, fourth and fifth go into a fingerprint, kept on this
 * Mac once a build has uploaded both files.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DERIVED_FILE = path.join(homedir(), "Library", "Caches", "AcadKit", "derived.json");

/** One hash over everything units.json and topics.json are built from, but the index. Order-blind over files. */
export function derivedFingerprint({ pin, files, syllabi, code, switches = {} }) {
  const h = createHash("sha256");
  h.update(`derived 1\n${pin}\n`);
  const lines = files.map((f) => [f.path, f.key, f.subject_code ?? "", f.unit ?? "", f.kind ?? ""].join("\t")).sort();
  for (const line of lines) h.update(`${line}\n`);
  h.update(`syllabi\n${syllabi ?? ""}\n`);
  for (const src of code) h.update(`code\n${src}\n`);
  for (const [k, v] of Object.entries(switches).sort(([a], [b]) => a.localeCompare(b))) h.update(`${k}=${v}\n`);
  return h.digest("hex");
}

/** The sources of the modules that build units.json and topics.json, in a fixed order. */
export async function derivedCode(paths) {
  return Promise.all([...paths].sort().map((p) => readFile(p, "utf8")));
}

/** The fingerprint of the last build that uploaded both files, or null. */
export async function lastDerived(file = DERIVED_FILE) {
  try {
    return JSON.parse(await readFile(file, "utf8")).fingerprint ?? null;
  } catch {
    return null;
  }
}

export async function recordDerived(fingerprint, file = DERIVED_FILE) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ fingerprint, at: Date.now() }));
}
