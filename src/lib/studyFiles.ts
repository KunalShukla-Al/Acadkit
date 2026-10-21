/** The study-folder tree, as written by scripts/sync-study-folder.mjs. */

export interface StudyFile {
  /** Path inside the synced folder, "/"-separated, e.g. "OS_21CSC202J/02_Notes/Unit1.pdf". */
  path: string;
  size: number;
  /** Last-modified time on the Mac, epoch ms. */
  mtime: number;
  /** Storage object key: "<device_id>/blobs/<sha256>.<ext>". */
  key: string;
  /**
   * Read off the path by the sync (scripts/lib/tags.mjs). Absent in a
   * manifest written before tagging.
   */
  subject_code?: string | null;
  unit?: number | null;
  kind?: FileKind;
  /**
   * A converted copy the viewer can read, for formats no browser can
   * (.doc → .docx, .ppt → .pdf), made on the Mac at sync
   * (scripts/lib/renditions.mjs). Absent when the Mac couldn't convert.
   */
  preview?: { key: string; ext: string } | null;
  /**
   * A past paper that isn't plainly this course's current paper, from the past-paper export via the sync
   * (scripts/lib/paperbank.mjs): set by an older regulation ("old"), filed from another course as
   * the nearest material ("neighbour"), or scanned too badly to read well. Absent when it is fine.
   */
  pyq?: { status?: "old" | "neighbour"; quality?: "fair" | "poor" } | null;
}

/** A short label for a past paper's note ("old syllabus · poor scan"), or null. */
export function pyqLabel(f: StudyFile): string | null {
  const parts = [
    f.pyq?.status === "old" ? "old syllabus" : f.pyq?.status === "neighbour" ? "another course's paper" : null,
    f.pyq?.quality === "poor" ? "poor scan" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/**
 * How much a search hit in this file counts: an old syllabus, another course's paper or a poor scan
 * gives way to the course's own clear material at a near tie, never drops out.
 */
export function searchWeight(f: StudyFile): number {
  let w = 1;
  if (f.pyq?.status) w *= 0.97;
  if (f.pyq?.quality === "poor") w *= 0.97;
  return w;
}

export type FileKind = "notes" | "lab" | "guide" | "pyq" | "syllabus" | "assignment" | "whatsapp" | "other";

export interface StudyManifest {
  version: 1;
  /** Name of the folder on the Mac, e.g. "SRM_Sem3". */
  root: string;
  /** When the sync ran, epoch ms. */
  syncedAt: number;
  files: StudyFile[];
}

export interface FolderEntry {
  name: string;
  /** Full path of the folder, no trailing slash. */
  path: string;
  /** Files anywhere below it. */
  count: number;
}

export interface FolderView {
  folders: FolderEntry[];
  files: StudyFile[];
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function extOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * A top-level folder of reference rather than daily reading (the syllabus
 * books for every course, `Syllabi/`, and the next semester's folder filed
 * ahead, `SRM_Sem4/`), which Study lists at the bottom of the page, below
 * the loose files.
 */
export function isReferenceFolder(dir: string, name: string): boolean {
  return !dir && /^(syllabi|srm_sem\d{1,2})$/i.test(name);
}

/** The immediate children of `dir` ("" is the root). */
export function listFolder(files: StudyFile[], dir: string): FolderView {
  const prefix = dir ? `${dir}/` : "";
  const folders = new Map<string, number>();
  const direct: StudyFile[] = [];
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) direct.push(f);
    else {
      const name = rest.slice(0, slash);
      folders.set(name, (folders.get(name) ?? 0) + 1);
    }
  }
  return {
    folders: [...folders]
      .map(([name, count]) => ({ name, path: prefix + name, count }))
      .sort((a, b) => collator.compare(a.name, b.name)),
    files: direct.sort((a, b) => collator.compare(baseName(a.path), baseName(b.path))),
  };
}

/** Files whose path matches every word of the query, in any order and any case - so "os unit 1" finds "OS_21CSC202J/02_Notes/Unit1_OS.pptx". */
export function searchFiles(files: StudyFile[], query: string, limit = 50): StudyFile[] {
  const parts = tokens(query);
  if (parts.length === 0) return [];
  const matches = (hay: string[]) =>
    parts.every((p) => (isNum(p) ? hay.some((t) => isNum(t) && Number(t) === Number(p)) : hay.some((t) => t.startsWith(p))));
  const hits = files.filter((f) => matches(tokens(f.path)));
  // A match in the file's own name beats one only in a folder above it.
  const inName = (f: StudyFile) => matches(tokens(baseName(f.path)));
  return hits
    .sort((a, b) => Number(inName(b)) - Number(inName(a)) || collator.compare(a.path, b.path))
    .slice(0, limit);
}

const isNum = (t: string) => /^\d+$/.test(t);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** "OS_21CSC202J" → "OS 21CSC202J". Display only; paths keep the original. */
export function prettyName(name: string): string {
  return name.replace(/_/g, " ");
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Number((bytes / 1024 ** 3).toFixed(2))} GB`;
}

// ---------- storage (scripts/lib/storage.mjs) ----------

/** What the bucket holds after the last sync, against the free plan's 1 GB: <pin>/storage.json. */
export interface StorageData {
  version: 1;
  used: number;
  limit: number;
  /** The sync uploads nothing that would take the bucket past this. */
  cap: number;
  /** Files that didn't fit under the cap, so aren't on Study yet. */
  refused: { path: string; size: number }[];
  at: number;
}

/** How full: "ok", "high" once 85% of the cap is used, "full" when the cap turned a file away or is reached. */
export function storageLevel(s: StorageData): "ok" | "high" | "full" {
  if (s.refused.length || s.used >= s.cap) return "full";
  return s.used >= s.cap * 0.85 ? "high" : "ok";
}

// ---------- search by meaning (migration 030) ----------

/** One passage the study-search function returned. */
export interface StudyHit {
  file_key: string;
  chunk_index: number;
  /** PDF page or slide, 1-based; null for formats without pages. */
  page: number | null;
  content: string;
  /** Cosine similarity to the query, −1 to 1. */
  similarity: number;
}

export interface FileHits {
  file: StudyFile;
  /** Best first. */
  hits: StudyHit[];
}

/**
 * Passages grouped by file, best file first. A file that has left the
 * folder since it was indexed is dropped rather than shown as a dead
 * link, and one path per content hash is enough.
 */
export function groupHits(hits: StudyHit[], files: StudyFile[], limit = 12): FileHits[] {
  const byKey = new Map<string, StudyFile>();
  for (const f of files) if (!byKey.has(f.key)) byKey.set(f.key, f);
  const groups = new Map<string, FileHits>();
  const score = (h: StudyHit) => h.similarity * (byKey.has(h.file_key) ? searchWeight(byKey.get(h.file_key)!) : 1);
  for (const h of [...hits].sort((a, b) => score(b) - score(a))) {
    const file = byKey.get(h.file_key);
    if (!file) continue;
    const g = groups.get(h.file_key) ?? { file, hits: [] };
    g.hits.push(h);
    groups.set(h.file_key, g);
  }
  return [...groups.values()].slice(0, limit);
}

/**
 * A passage cut to the part worth reading, with the query's words
 * marked: `[{ text, hit }]`. Matching is on whole-ish words of three or
 * more letters, case-insensitive; the window centres on the first hit.
 */
export function highlight(content: string, query: string, width = 220): Array<{ text: string; hit: boolean }> {
  const words = [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  const flat = content.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const first = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, Math.min(first - Math.floor(width / 3), flat.length - width));
  let text = flat.slice(start, start + width);
  if (start > 0) text = `…${text}`;
  if (start + width < flat.length) text = `${text}…`;
  if (words.length === 0) return [{ text, hit: false }];
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}

/**
 * A course's syllabus. Manifests synced before the tagger read top-level
 * folders tag the files in Syllabi/ as "other", so the folder is checked
 * too.
 */
export function isSyllabusFile(f: StudyFile): boolean {
  return f.kind === "syllabus" || /^syllabi\//i.test(f.path);
}

/** How far back "New & updated" looks. */
export const RECENT_DAYS = 14;

/** Files new or changed on the Mac in the last fortnight, newest first: what the weekly scan, WhatsApp saves and your uploads just brought in. */
export function recentFiles(files: StudyFile[], now: number, limit = 6): StudyFile[] {
  const since = now - RECENT_DAYS * 86_400_000;
  return files
    .filter((f) => f.mtime >= since && f.mtime <= now + 86_400_000 && f.kind !== "pyq" && !isSyllabusFile(f))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

// ---------- past papers by exam ----------

export interface PaperGroup {
  key: string;
  /** "FT-II", "End sem", "End sem · old syllabus", "Question banks", … */
  label: string;
  files: StudyFile[];
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };

/** Where a group sorts: the tests in order (FT-I before FT-II), then end-sems, then everything else. */
function groupRank(folder: string): [number, number] {
  const f = folder.toLowerCase();
  const test = /^(f[tj]|ct|cla|clat|cycle)[\s_-]*(i{1,3}|iv|v|\d)?/.exec(f);
  if (test) {
    const n = test[2] ? (ROMAN[test[2]] ?? Number(test[2])) : 9;
    return [0, n];
  }
  if (/end.?sem|model|university/.test(f)) return [1, 0];
  if (/question.?bank|worksheet|mcq/.test(f)) return [3, 0];
  if (/important|topics/.test(f)) return [4, 0];
  if (/^\d{2}[a-z]{3}\d{3}[a-z]/.test(f)) return [5, 0];
  return [6, 0];
}

function groupLabel(folder: string): string {
  const pretty = folder.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const code = /^(\d{2}[A-Z]{3}\d{3}[A-Z])\s*(.*)$/.exec(pretty);
  if (code) return `${code[2] || code[1]} (${code[1]}, another course)`;
  if (/^end.?sem$/i.test(pretty)) return "End sem";
  if (/^ct.?papers$/i.test(pretty)) return "CT papers";
  return pretty;
}

/**
 * A subject's past papers by the exam they're from: the folder under 07_PYQs ("FT-II",
 * "End_Sem"), with an old-syllabus subfolder as its own group. Tests come first in order,
 * then end-sems, then question banks and the rest.
 */
export function pastPaperGroups(files: StudyFile[]): PaperGroup[] {
  const groups = new Map<string, PaperGroup & { rank: [number, number] }>();
  for (const f of files) {
    const parts = f.path.split("/");
    const at = parts.findIndex((p) => /pyq|past.?papers?/i.test(p));
    const folder = at >= 0 && at + 1 < parts.length - 1 ? parts[at + 1] : "";
    const sub = at >= 0 && at + 2 < parts.length - 1 ? parts[at + 2] : "";
    const old = /old.?syllabus/i.test(sub);
    const key = folder ? `${folder}${old ? `/${sub}` : ""}` : "";
    const label = folder ? `${groupLabel(folder)}${old ? " · old syllabus" : ""}` : "Other papers";
    const rank = groupRank(folder || "~");
    if (!groups.has(key)) groups.set(key, { key, label, files: [], rank: old ? [rank[0], rank[1] + 0.5] : rank });
    groups.get(key)!.files.push(f);
  }
  return [...groups.values()]
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || collator.compare(a.label, b.label))
    .map(({ key, label, files: fs }) => ({
      key,
      label,
      // Newest exam first; photos of one paper stay together in page order.
      files: [...fs].sort((x, y) => paperYear(y) - paperYear(x) || collator.compare(baseName(x.path), baseName(y.path))),
    }));
}

function paperYear(f: StudyFile): number {
  const years = baseName(f.path).match(/(?:19|20)\d{2}/g);
  return years ? Math.max(...years.map(Number)) : 0;
}
