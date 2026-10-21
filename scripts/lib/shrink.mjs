/**
 * PDFs over 8 MB, shrunk for upload with Ghostscript (/ebook: images at
 * 150 dpi). A phone scan of a few pages is often 20-40 MB of camera JPEGs:
 * a 26-page DocScanner PDF goes from 42 MB to 3 MB and stays readable
 * zoomed in. The file on the Mac is never touched. The smaller copy is
 * cached by the original's hash and goes up under the original's key, so
 * nothing else in the sync changes. A copy that saves less than a quarter
 * is thrown away and remembered, so it isn't made again.
 */
import { spawn } from "node:child_process";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const SHRINK_OVER = 8 * 1024 * 1024;
const WORTH_IT = 0.75;
const CACHE = path.join(homedir(), "Library", "Caches", "AcadKit", "shrunk");
const GS = ["/opt/homebrew/bin/gs", "/usr/local/bin/gs"];

const exists = (p) => access(p).then(() => true, () => false);

/** Ghostscript's path, or null when it isn't installed. */
export async function findGs(candidates = GS) {
  for (const p of candidates) if (await exists(p)) return p;
  return null;
}

/** Ghostscript, writing `out`; rejects on failure or after two minutes. */
function runGs(gs, input, out) {
  return new Promise((resolve, reject) => {
    const args = ["-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/ebook", "-dCompatibilityLevel=1.6", `-sOutputFile=${out}`, input];
    const child = spawn(gs, args, { stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`gs exited ${code}`));
    });
  });
}

/**
 * The shrunk copy of a PDF: `{ path, size }`, or null when it isn't worth
 * uploading instead of the original. `sha` is the original's content hash.
 */
export async function shrunkCopy(full, sha, size, { gs, dir = CACHE, run = runGs } = {}) {
  const out = path.join(dir, `${sha}.pdf`);
  const skip = path.join(dir, `${sha}.skip`);
  if (await exists(out)) return { path: out, size: (await stat(out)).size };
  if (await exists(skip)) return null;
  await mkdir(dir, { recursive: true });
  const tmp = `${out}.tmp`;
  try {
    await run(gs, full, tmp);
    const small = (await stat(tmp)).size;
    if (small > 0 && small <= size * WORTH_IT) {
      await rename(tmp, out);
      return { path: out, size: small };
    }
  } catch {
    /* unreadable to Ghostscript: the original goes up */
  }
  await rm(tmp, { force: true });
  await writeFile(skip, "");
  return null;
}

/**
 * Every PDF over `over` bytes (8 MB; the night shift's sync asks for 2) in
 * `files` (the sync's list) gets `upload` (the shrunk copy's path) and
 * `uploadSize` where shrinking pays. Returns the bytes saved, or null when
 * Ghostscript isn't installed.
 */
export async function shrinkPdfs(files, { gs, over = SHRINK_OVER, log = console.log, ...opts } = {}) {
  const big = files.filter((f) => f.ext === "pdf" && f.size > over);
  if (!big.length) return 0;
  if (!gs) return null;
  let saved = 0;
  for (const f of big) {
    const sha = f.key.slice(f.key.lastIndexOf("/") + 1).split(".")[0];
    const copy = await shrunkCopy(f.full, sha, f.size, { gs, ...opts });
    if (!copy) continue;
    f.upload = copy.path;
    f.uploadSize = copy.size;
    saved += f.size - copy.size;
  }
  log(`Big PDFs: ${big.length} over ${Math.round(over / 1048576)} MB, ${big.filter((f) => f.upload).length} shrunk for upload, ${(saved / 1048576).toFixed(1)} MB saved`);
  return saved;
}
