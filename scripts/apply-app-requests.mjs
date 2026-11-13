#!/usr/bin/env node
/** Everything the app asks of the Mac, in one go. */
import { homedir } from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { macClient } from "./lib/mac-client.mjs";
import { applyDeletions } from "./apply-study-deletions.mjs";
import { applyUploads } from "./apply-study-uploads.mjs";
import { fileInbox } from "./lib/inbox.mjs";
import { fileURLToPath } from "node:url";
import { studyRoots } from "./lib/roots.mjs";
import { applySemesterSwitch } from "./lib/semester.mjs";
import { syncShortcuts } from "./lib/shortcuts.mjs";

const HEARTBEAT_EVERY = 30 * 60_000;
const STATE = path.join(homedir(), "Library", "Application Support", "AcadKit", "last-heartbeat");

export async function heartbeat({ supabase, pin, force = false }) {
  const last = Number(await readFile(STATE, "utf8").catch(() => "0")) || 0;
  if (!force && Date.now() - last < HEARTBEAT_EVERY) return;
  const at = Date.now();
  const { error } = await supabase.storage
    .from("study-files")
    .upload(`${pin}/heartbeat.json`, JSON.stringify({ at }), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "0",
    });
  if (error) throw new Error(`Couldn't write the heartbeat: ${error.message}`);
  await mkdir(path.dirname(STATE), { recursive: true });
  await writeFile(STATE, String(at));
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pin = process.env.STUDY_PIN;
if (!url || !key || !/^\d{4}$/.test(pin ?? "")) {
  console.error("Add VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN to .env.local.");
  process.exit(1);
}
const { dir, extras } = studyRoots();
const supabase = macClient(url, key);

let failed = false;
for (const step of [
  () => applyDeletions({ supabase, pin, dir, extras }),
  () => applyUploads({ supabase, pin, dir, extras }),
  // What reached Inbox, filed into its subject (scripts/lib/inbox.mjs).
  () => fileInbox({ supabase, pin, dir }),
  () => heartbeat({ supabase, pin }),
  // The iPhone's Day Order Shortcuts, rebuilt when the feed token changes (scripts/lib/shortcuts.mjs).
  () => syncShortcuts({ supabase, pin, supabaseUrl: url }),
  // Last: it moves STUDY_DIR, which the steps above read as `dir`.
  () =>
    applySemesterSwitch({
      supabase,
      pin,
      dir,
      repo: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      envFile: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local"),
    }),
]) {
  try {
    await step();
  } catch (err) {
    console.error(err.message);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
