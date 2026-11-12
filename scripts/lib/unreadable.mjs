/**
 * A file the sync can't read this run.
 *
 * With iCloud's Desktop & Documents on, a study file can be a placeholder
 * whose bytes live only in iCloud. Reading one from the background agent
 * fails with EDEADLK ("Unknown system error -11") instead of downloading
 * it, and one such file used to stop the whole sync. Now the file keeps its
 * last upload, so Study doesn't lose it, and the next sync reads it again.
 */

/** True for the errors a file that can't be read right now gives, as opposed to one that's gone. */
export function isUnreadable(err) {
  return err?.code !== "ENOENT";
}

/**
 * The last sync's entry for `path`, marked as kept, while its blob is still
 * in the bucket; null when there's nothing to keep (a new file, or a blob
 * already removed), so the file just waits for the next sync.
 */
export function keepLastUpload(path, prevFiles, remoteKeys) {
  const last = (prevFiles ?? []).find((f) => f?.path === path);
  if (!last?.key || !remoteKeys.has(last.key)) return null;
  return { ...last, full: null, kept: true };
}
