#!/usr/bin/env node
/** Everything the app asks of the Mac, in one go. */
import { homedir } from "node:os";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { applyDeletions } from "./apply-study-deletions.mjs";
import { applyUploads } from "./apply-study-uploads.mjs";
import { fileInbox } from "./lib/inbox.mjs";
import { autopilot, contentReader, filer } from "./lib/autopilot.mjs";
import { handler, isOn as recorderOn, recorder, recorderMissing } from "./lib/recorder.mjs";
import { reportJobs, tracked } from "./lib/jobs.mjs";
import { syncLectures } from "./lib/lecture-sync.mjs";
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
const supabase = createClient(url, key, { auth: { persistSession: false } });

// When Autopilot and the recorder last ran, for the Mac line on Today (scripts/lib/jobs.mjs).
const ran = {};
let failed = false;
for (const step of [
  () => applyDeletions({ supabase, pin, dir, extras }),
  () => applyUploads({ supabase, pin, dir, extras }),
  // What reached Inbox, read by the Mac's model first (scripts/lib/autopilot.mjs), so what it
  // shows can decide where it goes...
  tracked(ran, "autopilot", () => autopilot({ supabase, pin, dir })),
  // ...then filed into its subject (scripts/lib/inbox.mjs).
  async () => fileInbox({ supabase, pin, dir, readOf: await contentReader(), onMove: filer({ supabase, pin, dir }) }),
  () => heartbeat({ supabase, pin }),
  // Lectures recorded with Voice Memos, when RECORDER=on (scripts/lib/recorder.mjs).
  recorderOn()
    ? tracked(ran, "recorder", async () => {
        // Without whisper it does nothing; say so rather than looking done.
        const lacking = recorderMissing();
        if (lacking) return `waiting for ${lacking}`;
        const done = await recorder({ handle: handler({ supabase, pin, dir }), missing: recorderMissing });
        return done.length ? `${done.length} lecture${done.length === 1 ? "" : "s"}` : undefined;
      })
    : () => {},
  // ...and their transcripts to the app (scripts/lib/lecture-sync.mjs).
  () => syncLectures({ supabase, pin }),
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
await reportJobs({ supabase, pin, ran });
process.exit(failed ? 1 : 0);
