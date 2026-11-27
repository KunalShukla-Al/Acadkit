import { useMemo, useState, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useDialog } from "@/hooks/useDialog";
import { usePin } from "@/hooks/useData";
import { cancelStudyDeletions, fetchStudyDeletions, requestStudyDeletions } from "@/api/studyFiles";
import { deletedFiles, hiddenKeys, markDeleted, subscribeDeletedFiles, unmarkDeleted } from "@/lib/deletedFiles";
import { baseName, prettyName, type StudyFile } from "@/lib/studyFiles";

/**
 * What's deleted, from both sides: the server's requests (migration 032)
 * and this device's record of its own deletes (src/lib/deletedFiles.ts).
 * `hidden` maps each deleted path to the content key that went.
 */
export function useDeletedState() {
  const pin = usePin();
  const deletions = useQuery({
    queryKey: ["study-deletions", pin],
    queryFn: () => fetchStudyDeletions(pin),
    // While any are waiting, look again every minute, and pick up the new manifest too.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "pending") ? 60_000 : false),
    retry: 1,
  });
  const local = useSyncExternalStore(
    subscribeDeletedFiles,
    () => deletedFiles(pin),
    () => deletedFiles(pin)
  );
  const [now] = useState(() => Date.now());
  const hidden = useMemo(() => hiddenKeys(local, deletions.data ?? [], now), [local, deletions.data, now]);
  const pendingByPath = useMemo(
    () => new Map((deletions.data ?? []).filter((d) => d.status === "pending").map((d) => [d.path, d.id])),
    [deletions.data]
  );
  return { pin, deletions, local, hidden, pendingByPath };
}

/**
 * Deleting a study file: it leaves every list at once, the app asks the Mac,
 * and the Mac moves it to its Trash at the next sync. A toast offers Undo
 * until then; a request that didn't reach the server is sent again
 * (useStudyManifest).
 */
export function useStudyDeletions() {
  const { pin, deletions, hidden, pendingByPath } = useDeletedState();
  const qc = useQueryClient();
  const { confirm } = useDialog();
  const refresh = () => qc.invalidateQueries({ queryKey: ["study-deletions", pin] });

  const request = useMutation({
    mutationFn: (fs: StudyFile[]) => requestStudyDeletions(pin, fs, new Set(pendingByPath.keys())),
    onSuccess: refresh,
    // Still hidden and still recorded: the next visit online sends it.
    onError: () => toast.error("Couldn't reach AcadKit. The delete is saved and goes through when you're back online."),
  });
  const cancel = useMutation({
    mutationFn: (paths: string[]) => cancelStudyDeletions(pin, paths),
    onSettled: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ["study-files", pin] });
    },
    onError: () => toast.error("Couldn't undo. The Mac may already have moved it to the Trash."),
  });

  function remove(fs: StudyFile[], label: string) {
    markDeleted(pin, fs);
    const sent = request.mutateAsync(fs).catch(() => {});
    const paths = fs.map((f) => f.path);
    toast(`Deleted ${label}`, {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          unmarkDeleted(pin, paths);
          // After the request lands, or it would arrive after its own undo.
          void sent.then(() => cancel.mutate(paths));
        },
      },
    });
  }

  async function askDelete(f: StudyFile) {
    const ok = await confirm({
      title: `Delete ${baseName(f.path)}?`,
      body: "It leaves AcadKit now, and your Mac moves it to the Trash at its next sync. You can restore it from the Mac's Trash.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (ok) remove([f], baseName(f.path));
  }

  /** A whole folder: every file under `folder` (a path like "Operating_Systems/07_PYQs"). */
  async function askDeleteFolder(folder: string, files: StudyFile[]) {
    const inside = files.filter((f) => f.path.startsWith(`${folder}/`));
    if (inside.length === 0) return;
    const name = prettyName(folder.split("/").pop()!);
    const ok = await confirm({
      title: `Delete ${name}?`,
      body: `All ${inside.length} file${inside.length === 1 ? "" : "s"} in it leave AcadKit now, and your Mac moves them to the Trash at its next sync. You can restore them from the Mac's Trash.`,
      confirmLabel: `Delete ${inside.length} file${inside.length === 1 ? "" : "s"}`,
      destructive: true,
    });
    if (ok) remove(inside, name);
  }

  return {
    deletions,
    pendingByPath,
    hidden,
    /** Off when the deletions table can't be read (migration 032 not run). */
    available: !deletions.isError,
    askDelete,
    askDeleteFolder,
  };
}
