/**
 * Following a file that moved in the study folder.
 *
 * Blobs are content-addressed: a file's key is its sha256, so renaming or
 * moving a file keeps the same blob and only changes its path. Links in
 * Run-up, Exam prep and This week point at paths, though, so a move would
 * break them. `buildMoveMap` reads the last sync's manifest against this
 * one and, for each path that's gone, finds where its bytes live now; a
 * link to the old path then follows the file instead of dropping.
 */

/** The sha out of a blob key `<pin>/blobs/<sha>.<ext>`. */
const shaOf = (key) => (key ? key.split("/").pop().split(".")[0] : "");

/**
 * A map from each path that disappeared since the last sync to the single
 * path its contents now live at. A content that moved to two places at once
 * is skipped: there's no one file to follow.
 */
export function buildMoveMap(prevFiles, files) {
  const now = new Set(files.map((f) => f.path));
  const bySha = new Map();
  for (const f of files) {
    const s = shaOf(f.key);
    if (!bySha.has(s)) bySha.set(s, []);
    bySha.get(s).push(f.path);
  }
  const moved = new Map();
  for (const f of prevFiles ?? []) {
    if (!f?.path || now.has(f.path)) continue;
    const at = bySha.get(shaOf(f.key));
    if (at && at.length === 1 && at[0] !== f.path) moved.set(f.path, at[0]);
  }
  return moved;
}

/**
 * A resolver over the move map that remembers what it followed, so the sync
 * can report each move it healed. `resolve(path)` gives the file's new path,
 * or null when nothing moved there.
 */
export function follower(moved) {
  const follows = [];
  return {
    follows,
    resolve(p) {
      const to = moved?.get(p);
      if (to) follows.push([p, to]);
      return to ?? null;
    },
  };
}
