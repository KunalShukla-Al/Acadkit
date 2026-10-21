/**
 * EVAL.md, at the repo root: one section per part of AcadKit that runs a
 * model, each written by its own eval script.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_MD = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "EVAL.md");
const HEAD = "# Evaluations\n\nHow well the parts of AcadKit that run a model do, each measured against answers I know.\n\n";

/** `text` with the section that starts `## title` replaced by `section` (or added at the end), the rest kept. */
export function withSection(text, section) {
  const title = section.split("\n")[0];
  const before = text || HEAD;
  const start = before.indexOf(`${title}\n`);
  if (start === -1) return `${before.trimEnd()}\n\n${section.trimEnd()}\n`;
  const end = before.indexOf("\n## ", start + title.length);
  return `${before.slice(0, start)}${section.trimEnd()}\n${end === -1 ? "" : before.slice(end)}`.replace(/\n{3,}/g, "\n\n");
}

/** Writes one section into EVAL.md. */
export async function writeSection(section, file = EVAL_MD) {
  await writeFile(file, withSection(await readFile(file, "utf8").catch(() => ""), section));
}
