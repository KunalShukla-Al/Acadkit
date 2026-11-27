/**
 * Study files deleted on this device, remembered until the Mac's manifest
 * stops listing them.
 *
 * A delete reaches the Mac only at its next sync, and the manifest a phone
 * holds can be older than that. Without this record a deleted file comes
 * back whenever a list renders from the older manifest. Each entry keeps the
 * file's content key, so a new file saved later under the same name shows.
 */

export interface DeletedFile {
  path: string;
  key: string;
  /** When it was deleted (ms). */
  at: number;
}

/** A delete request as the server holds it (study_file_deletions). */
export interface DeletionRow {
  path: string;
  key: string;
  status: "pending" | "done" | "skipped";
  done_at: string | null;
}

/** An entry the Mac never acted on stops hiding its file after this long. */
export const DELETED_TTL = 7 * 24 * 60 * 60_000;

const PREFIX = "acadkit:deleted:";
const listeners = new Set<() => void>();
const lists = new Map<string, DeletedFile[]>();
const EMPTY: DeletedFile[] = [];

function load(pin: string): DeletedFile[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFIX + pin) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as DeletedFile[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** This pin's entries. The same array comes back until they change. */
export function deletedFiles(pin: string): DeletedFile[] {
  if (!pin) return EMPTY;
  let list = lists.get(pin);
  if (!list) {
    list = load(pin);
    lists.set(pin, list);
  }
  return list;
}

function save(pin: string, list: DeletedFile[]) {
  lists.set(pin, list);
  try {
    if (list.length) localStorage.setItem(PREFIX + pin, JSON.stringify(list));
    else localStorage.removeItem(PREFIX + pin);
  } catch {
    // Storage full or disabled: the record lasts until the page closes.
  }
  for (const cb of listeners) cb();
}

export function subscribeDeletedFiles(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function markDeleted(pin: string, files: { path: string; key: string }[], now = Date.now()) {
  const paths = new Set(files.map((f) => f.path));
  const kept = deletedFiles(pin).filter((d) => !paths.has(d.path));
  save(pin, [...kept, ...files.map((f) => ({ path: f.path, key: f.key, at: now }))]);
}

export function unmarkDeleted(pin: string, paths: string[]) {
  const drop = new Set(paths);
  const list = deletedFiles(pin);
  const kept = list.filter((d) => !drop.has(d.path));
  if (kept.length !== list.length) save(pin, kept);
}

/** Replace this pin's entries with `list`, if it differs. */
export function keepDeleted(pin: string, list: DeletedFile[]) {
  if (list.length !== deletedFiles(pin).length) save(pin, list);
}

/** Every pin's entries, on sign-out. */
export function clearDeletedFiles() {
  lists.clear();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {
    // Nothing stored, then.
  }
  for (const cb of listeners) cb();
}

/** The Mac turned this entry's delete down after it was made: the file stays. */
function keptByMac(d: DeletedFile, rows: DeletionRow[]) {
  return rows.some((r) => r.path === d.path && r.status === "skipped" && r.done_at && Date.parse(r.done_at) >= d.at);
}

/**
 * What to hide: path → the content key that was deleted. Open and finished
 * requests hide their file on every device. This device's own entries hide
 * theirs too, unless the Mac kept the file or the entry has expired.
 */
export function hiddenKeys(local: DeletedFile[], rows: DeletionRow[], now: number): Map<string, string> {
  const hidden = new Map<string, string>();
  for (const r of rows) if (r.status !== "skipped") hidden.set(r.path, r.key);
  for (const d of local) if (now - d.at < DELETED_TTL && !keptByMac(d, rows)) hidden.set(d.path, d.key);
  return hidden;
}

export function visibleFiles<T extends { path: string; key: string }>(files: T[], hidden: Map<string, string>): T[] {
  return hidden.size ? files.filter((f) => hidden.get(f.path) !== f.key) : files;
}

/**
 * Entries worth keeping: the manifest still lists that same file, the Mac
 * hasn't turned the delete down, and the entry hasn't expired.
 */
export function pruneDeleted(
  local: DeletedFile[],
  files: { path: string; key: string }[],
  rows: DeletionRow[],
  now: number
): DeletedFile[] {
  const listed = new Map(files.map((f) => [f.path, f.key]));
  return local.filter((d) => listed.get(d.path) === d.key && now - d.at < DELETED_TTL && !keptByMac(d, rows));
}

/** Entries the server has no request for, though the manifest still lists the file: send them again. */
export function unsentDeletes(local: DeletedFile[], files: { path: string; key: string }[], rows: DeletionRow[]): DeletedFile[] {
  const listed = new Map(files.map((f) => [f.path, f.key]));
  return local.filter((d) => listed.get(d.path) === d.key && !rows.some((r) => r.path === d.path && r.status !== "skipped"));
}
