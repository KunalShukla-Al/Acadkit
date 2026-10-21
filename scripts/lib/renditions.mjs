/**
 * Readable copies of Office files, for the app's file viewer: a PDF made by
 * LibreOffice, which lays slides and pages out as PowerPoint and Word do.
 * The app has no reader for a .pptx without one, and its own .docx renderer
 * drops bullets, alignment, crops and backgrounds, so it's only the fallback
 * until the Mac has synced.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const CACHE = path.join(homedir(), "Library", "Caches", "AcadKit", "renditions");
const SOFFICE = ["/Applications/LibreOffice.app/Contents/MacOS/soffice", "soffice"];
// Its own profile, so a LibreOffice window open on the Mac doesn't swallow the conversion.
const PROFILE = `-env:UserInstallation=file://${path.join(CACHE, "..", "libreoffice-profile")}`;

/** What each Office format becomes. */
export const RENDITION = { doc: "pdf", docx: "pdf", ppt: "pdf", pptx: "pdf", xls: "xlsx" };
/** Without LibreOffice, a .doc still gets a .docx from macOS's textutil. */
const TEXTUTIL = { doc: "docx" };
/**
 * The version of what tidyDeck does to a .pptx before converting it. It's
 * in a deck's cache name, so changing the tidying (and bumping this)
 * converts every deck again at the next sync.
 */
const DECK_TIDY = 3;

const exec = promisify(execFile);

/** Where an Office file's PDF rendition is cached, by the file's sha256 (`<sha>.pdf`, a .pptx `<sha>.deck3.pdf`). */
export function renditionPath(sha, ext, cacheDir = CACHE) {
  const stem = ext === "pptx" ? `${sha}.deck${DECK_TIDY}` : sha;
  return path.join(cacheDir, `${stem}.${RENDITION[ext]}`);
}

/**
 * Convert every Office file in `files` ({ path, full, key, ext }), returning
 * path → { full, ext, sha } of the converted copy. `run(cmd, args)` and
 * `exists(file)` are injectable for tests.
 */
export async function buildRenditions(files, { run = exec, exists = fileExists, cacheDir = CACHE, log = console.log } = {}) {
  const office = files.filter((f) => RENDITION[f.ext]);
  const out = new Map();
  if (office.length === 0) return out;
  await mkdir(cacheDir, { recursive: true });
  let soffice; // undefined: not looked for yet; null: not on this Mac
  const missing = new Set();
  for (const f of office) {
    let to = RENDITION[f.ext];
    const srcSha = path.basename(f.key).replace(/\.[^.]+$/, "");
    let cached = renditionPath(srcSha, f.ext, cacheDir);
    if (!(await exists(cached))) {
      if (soffice === undefined) soffice = await findSoffice(run);
      if (!soffice && TEXTUTIL[f.ext]) {
        to = TEXTUTIL[f.ext];
        cached = path.join(cacheDir, `${srcSha}.${to}`);
      }
    }
    if (!(await exists(cached))) {
      try {
        if (!soffice && to === TEXTUTIL[f.ext]) {
          await run("textutil", ["-convert", to, "-output", cached, f.full]);
        } else {
          if (!soffice) {
            missing.add(`LibreOffice (for .${f.ext})`);
            continue;
          }
          // soffice names its output after the input, so convert in a
          // scratch folder and move the result into the cache.
          const tmp = await mkdtemp(path.join(tmpdir(), "acadkit-convert-"));
          try {
            const input = f.ext === "pptx" ? await tidyDeck(f.full, tmp, run) : f.full;
            await run(soffice, ["--headless", "--convert-to", to, "--outdir", tmp, input, PROFILE]);
            const made = path.join(tmp, `${path.basename(f.full).replace(/\.[^.]+$/, "")}.${to}`);
            // soffice exits 0 on a file it couldn't load; the missing
            // output is the only sign.
            if (!(await exists(made))) throw new Error("LibreOffice couldn't read it");
            await rename(made, cached);
          } finally {
            await rm(tmp, { recursive: true, force: true });
          }
        }
      } catch (err) {
        if (err?.code === "ENOENT") missing.add(to === TEXTUTIL[f.ext] ? "textutil (for .doc)" : `LibreOffice (for .${f.ext})`);
        else log(`  couldn't convert ${f.path}: ${err?.message ?? err}`);
        continue;
      }
    }
    try {
      const sha = createHash("sha256").update(await readFile(cached)).digest("hex");
      out.set(f.path, { full: cached, ext: to, sha });
    } catch {
      // The converter reported success and wrote nothing: no preview.
    }
  }
  for (const m of missing) log(`  no ${m} on this Mac: those files open as downloads only`);
  return out;
}

/** A tiled texture this small (in pixels) or smaller becomes a solid fill. */
const TINY_TILE = 16 * 16;
const TILED = /<a:blipFill\b[^>]*>(?:(?!<\/a:blipFill>)[\s\S])*?<a:blip\b[^>]*r:embed="([^"]+)"(?:(?!<\/a:blipFill>)[\s\S])*?<a:tile\b[^>]*\/>(?:(?!<\/a:blipFill>)[\s\S])*?<\/a:blipFill>/g;

/**
 * A copy of the deck at `full`, made in `tmp`, tidied for LibreOffice: tiny
 * tiled textures flattened (flattenTinyTiles) and no bullets on blank lines
 * (hideBlankBullets). The deck itself when there's nothing to tidy or it
 * can't be taken apart.
 */
async function tidyDeck(full, tmp, run) {
  const dir = path.join(tmp, "unzipped");
  try {
    await run("unzip", ["-q", full, "-d", dir]);
    const tiles = await flattenTinyTiles(dir, { average: (img) => sipsAverage(img, run) });
    const bullets = await hideBlankBullets(dir);
    if (!tiles && !bullets) return full;
    const copy = path.join(tmp, "in", path.basename(full));
    await mkdir(path.dirname(copy), { recursive: true });
    await run("zip", ["-q", "-r", "-X", copy, "."], { cwd: dir });
    return copy;
  } catch {
    return full;
  }
}

/** In the unzipped deck at `dir`, every slide through tidyBullets; returns how many lines it changed. */
export async function hideBlankBullets(dir) {
  const folder = path.join(dir, "ppt", "slides");
  let names;
  try {
    names = await readdir(folder);
  } catch {
    return 0;
  }
  let changed = 0;
  for (const name of names.filter((n) => n.endsWith(".xml"))) {
    const file = path.join(folder, name);
    const before = await readFile(file, "utf8");
    const { xml, changed: n } = tidyBullets(before);
    if (n) await writeFile(file, xml);
    changed += n;
  }
  return changed;
}

const BLANK = /^[\s\u00a0]*$/;
const PARAGRAPH = /<a:p>([\s\S]*?)<\/a:p>/g;
const P_PR = /^\s*(<a:pPr\b[^>]*\/>|<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>)?/;
// Empty runs and line breaks at the start of a paragraph.
const LEADING_BLANKS = /^(?:\s*<a:r>\s*(?:<a:rPr\b[^>]*\/>|<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>)?\s*(?:<a:t\s*\/>|<a:t>[\s\u00a0]*<\/a:t>)\s*<\/a:r>|\s*<a:br\s*\/>|\s*<a:br>[\s\S]*?<\/a:br>)+/;
const BULLET_KIND = /<a:bu(?:None|Char|AutoNum)\b[^>]*\/>|<a:buBlip>[\s\S]*?<\/a:buBlip>/g;

/** A paragraph's text, entities decoded. */
const textOf = (p) =>
  [...p.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)]
    .map((m) => m[1])
    .join("")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : +n))
    .replace(/&nbsp;/g, "\u00a0");

/**
 * A slide's paragraphs as PowerPoint authors meant them to read: a line of
 * nothing but spaces gets no bullet, and a paragraph that opens with a line
 * break starts on its bullet's line. Both show as a bullet on an empty line
 * (PowerPoint draws one too, for a typed space or break), which on a phone
 * reads as a rendering fault. Returns the XML and how many it changed.
 */
export function tidyBullets(xml) {
  let changed = 0;
  const out = xml.replace(PARAGRAPH, (whole, inner) => {
    const pPr = inner.match(P_PR)[1] ?? "";
    const body = inner.slice(inner.match(P_PR)[0].length);
    if (!textOf(body).length || BLANK.test(textOf(body))) {
      // Only a paragraph with something in it shows a bullet; an empty one is left alone.
      if (!/<a:t>/.test(body) || /<a:buNone\s*\/>/.test(pPr)) return whole;
      changed++;
      return `<a:p>${noBullet(pPr)}${body}</a:p>`;
    }
    const lead = body.match(LEADING_BLANKS);
    if (lead && /<a:br\b/.test(lead[0])) {
      changed++;
      return `<a:p>${pPr}${body.slice(lead[0].length)}</a:p>`;
    }
    return whole;
  });
  return { xml: out, changed };
}

/** A paragraph's properties with its bullet set to none, in the place the schema wants it. */
function noBullet(pPr) {
  if (!pPr) return "<a:pPr><a:buNone/></a:pPr>";
  if (pPr.endsWith("/>")) return `${pPr.slice(0, -2).trimEnd()}><a:buNone/></a:pPr>`;
  const inner = pPr.replace(BULLET_KIND, "");
  const at = inner.search(/<a:tabLst\b|<a:defRPr\b|<a:extLst\b|<\/a:pPr>/);
  return `${inner.slice(0, at)}<a:buNone/>${inner.slice(at)}`;
}

/**
 * PowerPoint fills a background by repeating a texture image; LibreOffice
 * writes every repeat into the PDF as its own drawing. The OS decks' 5 px
 * texture at 65% came to ~67,000 drawings a slide: a 20 MB PDF that took
 * seconds a page to show. A texture that small reads as its average colour,
 * so in the unzipped deck at `dir` each one becomes a solid fill of that
 * colour. `average(image)` gives { width, height, colour: [r, g, b] }.
 * Returns how many it flattened.
 */
export async function flattenTinyTiles(dir, { average }) {
  let flattened = 0;
  for (const part of ["slides", "slideLayouts", "slideMasters"]) {
    const folder = path.join(dir, "ppt", part);
    let names;
    try {
      names = await readdir(folder);
    } catch {
      continue;
    }
    for (const name of names.filter((n) => n.endsWith(".xml"))) {
      const file = path.join(folder, name);
      const xml = await readFile(file, "utf8");
      if (!xml.includes("<a:tile")) continue;
      const rels = await readFile(path.join(folder, "_rels", `${name}.rels`), "utf8").catch(() => "");
      let out = xml;
      for (const [fill, id] of xml.matchAll(TILED)) {
        const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${id}"`));
        const target = rel?.match(/Target="([^"]+)"/)?.[1];
        if (!target) continue;
        const img = await average(path.resolve(folder, target)).catch(() => null);
        if (!img || img.width * img.height > TINY_TILE) continue;
        const hex = img.colour.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
        out = out.replace(fill, `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`);
        flattened++;
      }
      if (out !== xml) await writeFile(file, out);
    }
  }
  return flattened;
}

/** An image's size and average colour, read through macOS's sips as a BMP. */
async function sipsAverage(image, run) {
  const tmp = await mkdtemp(path.join(tmpdir(), "acadkit-tile-"));
  try {
    const bmp = path.join(tmp, "tile.bmp");
    await run("sips", ["-s", "format", "bmp", image, "--out", bmp]);
    return bmpAverage(await readFile(bmp));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/** The size and average colour of an uncompressed 24- or 32-bit BMP. */
export function bmpAverage(buf) {
  const start = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  const height = Math.abs(buf.readInt32LE(22));
  const bytes = buf.readUInt16LE(28) / 8;
  if (bytes !== 3 && bytes !== 4) throw new Error(`${bytes * 8}-bit BMP`);
  // Where red, green and blue sit in a pixel: blue-green-red bytes, unless the header gives masks (BI_BITFIELDS).
  const masks = buf.readUInt32LE(30) === 3 ? [54, 58, 62].map((o) => buf.readUInt32LE(o)) : [0xff0000, 0xff00, 0xff];
  const shifts = masks.map((m) => Math.log2(m & -m));
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const sum = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = start + y * stride + x * bytes;
      const px = bytes === 4 ? buf.readUInt32LE(i) : buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16);
      for (let c = 0; c < 3; c++) sum[c] += ((px & masks[c]) >>> 0) / 2 ** shifts[c];
    }
  }
  return { width, height, colour: sum.map((v) => Math.round(v / (width * height))) };
}

async function findSoffice(run) {
  for (const cmd of SOFFICE) {
    try {
      await run(cmd, ["--version"]);
      return cmd;
    } catch {
      // try the next
    }
  }
  return null;
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
