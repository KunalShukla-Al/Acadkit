#!/usr/bin/env node
/**
 * Act on files deleted from the app's Study screen (migration 032).
 *
 * Retry-safe: a request whose status update failed stays pending, and the
 * retry finds the copy it already moved to the Trash (same bytes) and records
 * that move. Only a file that is truly missing counts as gone.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { macClient } from "./lib/mac-client.mjs";
import { dropFromPrep, resolveRequest, shaOfKey, sourceOf, trashName, webVersionOf } from "./lib/deletions.mjs";
import { placeOf, studyRoots } from "./lib/roots.mjs";

const shaOf = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function toTrash(full, trash) {
  const name = trashName(path.basename(full), (n) => existsSync(path.join(trash, n)));
  await rename(full, path.join(trash, name));
  return name;
}

/** The Trash name already holding these bytes ("a.pdf", "a (AcadKit 2).pdf", …), or null. */
function inTrash(trash, base, sha) {
  const holds = (n) => statSync(path.join(trash, n)).isFile() && shaOf(path.join(trash, n)) === sha;
  const name = trashName(base, (n) => existsSync(path.join(trash, n)) && !holds(n));
  return existsSync(path.join(trash, name)) ? name : null;
}

/**
 * A folder deleted in the app arrives as one request per file; once they
 * are all in the Trash, the folders they leave empty go too (up to, never
 * including, `stop`). A Finder .DS_Store doesn't count as content.
 */
async function pruneEmpty(dirPath, stop) {
  for (let d = dirPath; d.startsWith(stop + path.sep); d = path.dirname(d)) {
    let names;
    try {
      names = await readdir(d);
    } catch {
      return;
    }
    if (names.some((n) => n !== ".DS_Store")) return;
    if (names.length) await unlink(path.join(d, ".DS_Store"));
    await rmdir(d);
  }
}

/**
 * A PDF's _src markdown and web version follow it to the Trash, or the next
 * rebuild brings it back. Returns the note's "and its source …" part.
 */
async function trashCompanions(at, trash) {
  const src = sourceOf(at.rel);
  if (!src) return "";
  let also = "";
  const s = resolveRequest(path.join(at.dir, "_src"), src.slice("_src/".length));
  if (s.full && existsSync(s.full)) {
    also = ` and its source ${await toTrash(s.full, trash)}`;
    await pruneEmpty(path.dirname(s.full), path.join(at.dir, "_src"));
  }
  const web = webVersionOf(at.rel);
  const w = web && resolveRequest(path.join(at.dir, "_src", "_html"), web.slice("_src/_html/".length));
  if (w?.full && existsSync(w.full)) {
    await toTrash(w.full, trash);
    await pruneEmpty(path.dirname(w.full), path.join(at.dir, "_src", "_html"));
  }
  return also;
}

export async function applyDeletions({
  supabase,
  pin,
  dir,
  extras = [],
  trash = path.join(homedir(), ".Trash"),
  dryRun = false,
  log = console.log,
}) {
  const { data, error } = await supabase
    .from("study_file_deletions")
    .select("id, path, key")
    .eq("device_id", pin)
    .eq("status", "pending")
    .order("requested_at");
  if (error) {
    // Before migration 032 there is simply nothing to do.
    if (/study_file_deletions/.test(error.message)) return 0;
    throw new Error(`Couldn't read delete requests: ${error.message}`);
  }
  let moved = 0;
  const gone = new Set();
  for (const req of data ?? []) {
    const finish = (status, note) =>
      dryRun
        ? Promise.resolve()
        : supabase
            .from("study_file_deletions")
            .update({ status, note, done_at: new Date().toISOString() })
            .eq("id", req.id)
            .then(({ error: e }) => e && log(`  couldn't update request for ${req.path}: ${e.message}`));

    // A file of the next semester's folder ("SRM_Sem4/…") lives in that folder.
    const at = placeOf(req.path, dir, extras);
    const target = resolveRequest(at.dir, at.rel);
    if (target.error) {
      log(`  skip ${req.path}: ${target.error}`);
      await finish("skipped", target.error);
      continue;
    }
    let info;
    try {
      info = await stat(target.full);
    } catch (err) {
      // Unreadable isn't gone: the request waits for the next sync.
      if (err.code !== "ENOENT" && err.code !== "ENOTDIR") {
        log(`  can't check ${req.path}: ${err.message}`);
        continue;
      }
      // An earlier run may have moved it, then failed to say so.
      const earlier = inTrash(trash, path.basename(target.full), shaOfKey(req.key));
      if (!earlier) {
        log(`  gone already: ${req.path}`);
        await finish("done", "already gone from the Mac");
        continue;
      }
      const also = dryRun ? "" : await trashCompanions(at, trash);
      log(`  - ${req.path} already in the Trash as ${earlier}${also}`);
      await finish("done", `moved to the Trash as ${earlier}${also}`);
      if (!dryRun) gone.add(req.path);
      continue;
    }
    if (!info.isFile()) {
      await finish("skipped", "not a file");
      continue;
    }
    if (shaOf(target.full) !== shaOfKey(req.key)) {
      log(`  skip ${req.path}: changed on the Mac since you deleted it in the app`);
      await finish("skipped", "it changed on the Mac after you deleted it in the app");
      continue;
    }
    if (dryRun) {
      log(`  - ${req.path} (would move to the Trash)`);
      continue;
    }
    const name = await toTrash(target.full, trash);
    const alsoSrc = await trashCompanions(at, trash);
    await pruneEmpty(path.dirname(target.full), at.dir);
    log(`  - ${req.path} → Trash as ${name}${alsoSrc}`);
    await finish("done", `moved to the Trash as ${name}${alsoSrc}`);
    gone.add(req.path);
    moved++;
  }
  // Exam prep stops pointing at what was just deleted.
  if (gone.size) {
    const prepFile = path.join(dir, "_src", "acadkit_prep.json");
    try {
      const { prep, removed } = dropFromPrep(JSON.parse(await readFile(prepFile, "utf8")), gone);
      if (removed) {
        await writeFile(prepFile, JSON.stringify(prep, null, 2) + "\n");
        log(`  Exam prep: removed ${removed} link${removed === 1 ? "" : "s"} to deleted files`);
      }
    } catch {
      /* no prep file, or not ours to fix: the sync reports bad links anyway */
    }
  }
  if (moved) log(`Moved ${moved} to the Trash`);
  return moved;
}

// Run directly: npm run sync:deletions
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const pin = process.env.STUDY_PIN;
  if (!url || !key || !/^\d{4}$/.test(pin ?? "")) {
    console.error("Add VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN to .env.local.");
    process.exit(1);
  }
  const { dir, extras } = studyRoots();
  const supabase = macClient(url, key);
  await applyDeletions({ supabase, pin, dir, extras, dryRun: process.argv.includes("--dry-run") });
}
