/**
 * Save files uploaded from the app into the study folder (migration 033).
 *
 * Retry-safe: the inbox copy is removed only after the row is marked done, so a
 * failed status update leaves the upload pending and still downloadable. The
 * retry then finds the copy it already saved and reuses it.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { freeName, resolveRequest } from "./lib/deletions.mjs";
import { placeOf } from "./lib/roots.mjs";

const BUCKET = "study-files";

const sameBytes = (file, bytes) => {
  const st = statSync(file);
  return st.isFile() && st.size === bytes.length && readFileSync(file).equals(bytes);
};

export async function applyUploads({ supabase, pin, dir, extras = [], dryRun = false, log = console.log }) {
  const { data, error } = await supabase
    .from("study_uploads")
    .select("id, path, key")
    .eq("device_id", pin)
    .eq("status", "pending")
    .order("created_at");
  if (error) {
    // Before migration 033 there is simply nothing to do.
    if (/study_uploads/.test(error.message)) return 0;
    throw new Error(`Couldn't read uploads: ${error.message}`);
  }
  const bucket = supabase.storage.from(BUCKET);
  let saved = 0;
  for (const up of data ?? []) {
    /** Settle the row; false when the update failed, so the caller keeps the inbox copy. */
    const finish = async (status, note) => {
      if (dryRun) return true;
      const { error: e } = await supabase
        .from("study_uploads")
        .update({ status, note, done_at: new Date().toISOString() })
        .eq("id", up.id);
      if (e) log(`  couldn't update upload ${up.path}: ${e.message}`);
      return !e;
    };

    // Into the next semester's folder when it was uploaded there ("SRM_Sem4/…").
    const at = placeOf(up.path, dir, extras);
    const target = resolveRequest(at.dir, at.rel);
    if (target.error || !String(up.key).startsWith(`${pin}/inbox/`)) {
      log(`  skip upload ${up.path}: ${target.error ?? "not in this PIN's inbox"}`);
      await finish("skipped", target.error ?? "not in this PIN's inbox");
      continue;
    }
    if (dryRun) {
      log(`  + ${up.path} (would save from the app)`);
      continue;
    }
    const { data: blob, error: dlErr } = await bucket.download(up.key);
    if (dlErr || !blob) {
      // Row written before the upload finished, or the upload failed: try again next run.
      log(`  upload ${up.path} not ready yet (${dlErr?.message ?? "empty"})`);
      continue;
    }
    const bytes = Buffer.from(await blob.arrayBuffer());
    const parent = path.dirname(target.full);

    // The first free name, or one already holding these bytes (an earlier run's copy).
    const name = freeName(
      path.basename(target.full),
      (n) => existsSync(path.join(parent, n)) && !sameBytes(path.join(parent, n), bytes),
      " (%d)",
    );
    const again = existsSync(path.join(parent, name));
    if (!again) {
      await mkdir(parent, { recursive: true });
      await writeFile(path.join(parent, name), bytes, { flag: "wx" });
      saved++;
    }
    const inside = path.relative(at.dir, path.join(parent, name)).split(path.sep).join("/");
    const rel = at.dir === dir ? inside : `${up.path.slice(0, up.path.length - at.rel.length)}${inside}`;
    log(again ? `  = ${rel} (already in the folder)` : `  + ${rel} (from the app)`);
    if (!(await finish("done", rel === up.path ? "saved" : `saved as ${rel}`))) continue;
    const { error: rmErr } = await bucket.remove([up.key]);
    if (rmErr) log(`  couldn't clear the inbox copy of ${rel}: ${rmErr.message}`);
  }
  if (saved) log(`Saved ${saved} from the app`);
  return saved;
}
