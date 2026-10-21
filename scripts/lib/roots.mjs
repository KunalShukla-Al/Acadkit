/**
 * The folders the sync mirrors. STUDY_DIR is this semester's; STUDY_NEXT_DIR
 * (optional) is the next one's, filed ahead, which the app shows as one more
 * folder inside it ("SRM_Sem4/…") so its notes, past papers and syllabus
 * units are known before the semester starts. After `npm run semester:switch`
 * the next folder IS STUDY_DIR, and is no longer mirrored twice.
 */
import { homedir } from "node:os";
import path from "node:path";

const expand = (p, home) => p.trim().replace(/^~(?=$|\/)/, home);

/** `{ dir, extras: [{ prefix, dir }] }` from the environment. */
export function studyRoots(env = process.env, home = homedir()) {
  const dir = expand(env.STUDY_DIR || "~/Documents/SRM_Sem3", home);
  const next = env.STUDY_NEXT_DIR?.trim() ? expand(env.STUDY_NEXT_DIR, home) : null;
  const extras = next && path.resolve(next) !== path.resolve(dir) ? [{ prefix: path.basename(next), dir: next }] : [];
  return { dir, extras };
}

/** Which folder on the Mac a manifest path is in, and its path inside that folder. */
export function placeOf(rel, dir, extras = []) {
  for (const x of extras) if (String(rel).startsWith(`${x.prefix}/`)) return { dir: x.dir, rel: rel.slice(x.prefix.length + 1) };
  return { dir, rel };
}
