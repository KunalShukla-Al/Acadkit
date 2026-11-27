import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchStudyManifest, requestStudyDeletion } from "@/api/studyFiles";
import { keepDeleted, pruneDeleted, unsentDeletes, visibleFiles } from "@/lib/deletedFiles";
import { useDeletedState } from "@/hooks/useStudyDeletions";

/** Deletes being sent again, so pages mounting together send each once. */
const resending = new Set<string>();

/**
 * The study folder's manifest, with deleted files left out. While a list
 * is open it also tidies this device's record of deletes: entries whose
 * file has left the manifest go, and a delete the server never received
 * is sent again.
 */
export function useStudyManifest() {
  const qc = useQueryClient();
  const { pin, deletions, local, hidden } = useDeletedState();
  const manifest = useQuery({
    queryKey: ["study-files", pin],
    queryFn: () => fetchStudyManifest(pin),
    staleTime: 5 * 60_000,
  });
  const files = useMemo(() => visibleFiles(manifest.data?.files ?? [], hidden), [manifest.data, hidden]);

  const listed = manifest.data?.files;
  const rows = deletions.data;
  useEffect(() => {
    // Either answer may come from the offline cache. Both steps stay safe with an old one:
    // an open request still hides its file, and a repeated request is ignored.
    if (!listed || !rows || local.length === 0) return;
    keepDeleted(pin, pruneDeleted(local, listed, rows, Date.now()));
    for (const d of unsentDeletes(local, listed, rows)) {
      if (resending.has(d.path)) continue;
      resending.add(d.path);
      requestStudyDeletion(pin, { path: d.path, key: d.key })
        .then(() => qc.invalidateQueries({ queryKey: ["study-deletions", pin] }))
        .catch(() => {})
        .finally(() => resending.delete(d.path));
    }
  }, [listed, rows, local, pin, qc]);

  return { manifest, files };
}
