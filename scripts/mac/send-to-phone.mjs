#!/usr/bin/env node
/**
 * Continue from the Mac: the Finder's Quick Action "Send to AcadKit phone"
 * (scripts/mac/send-to-phone.workflow, installed by npm run mac:install)
 * runs this with the files picked. A file already in the study folder is
 * on the phone already; one from elsewhere is copied into the study
 * folder's Inbox, which the sync uploads in seconds. The last one becomes
 * where you're reading, from the computer (migration 062), so the phone's
 * Today offers "Continue <file> · from your computer".
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { freeName } from "../lib/deletions.mjs";
import { INBOX } from "../lib/inbox.mjs";
import { studyRoots } from "../lib/roots.mjs";

const run = promisify(execFile);

/**
 * Where each file is for the phone, relative to the study folder: as it is
 * inside it, copied into its Inbox from outside. Folders are left out.
 */
export async function placeForPhone(files, dir) {
  const out = [];
  for (const full of files) {
    if (!(await stat(full).then((s) => s.isFile(), () => false))) continue;
    const rel = path.relative(dir, full);
    if (!rel.startsWith("..") && !path.isAbsolute(rel)) {
      out.push({ rel: rel.split(path.sep).join("/"), copied: false });
      continue;
    }
    const inbox = path.join(dir, INBOX);
    await mkdir(inbox, { recursive: true });
    const name = freeName(path.basename(full), (n) => existsSync(path.join(inbox, n)), " (%d)");
    await copyFile(full, path.join(inbox, name));
    out.push({ rel: `${INBOX}/${name}`, copied: true });
  }
  return out;
}

/** What the notification says once the files are on their way. */
export function sentMessage(placed) {
  if (!placed.length) return "Nothing to send: pick files, not folders.";
  const last = path.basename(placed.at(-1).rel);
  const more = placed.length > 1 ? ` and ${placed.length - 1} more` : "";
  return placed.some((p) => p.copied)
    ? `${last}${more} goes to your phone at the next sync, in Inbox. AcadKit there offers it.`
    : `${last}${more} is on your phone: AcadKit there offers it.`;
}

/** Sends the files, and returns the notification's line. */
export async function sendToPhone({ files, dir, supabase, pin }) {
  const placed = await placeForPhone(files, dir);
  if (placed.length) {
    const last = placed.at(-1);
    const { error } = await supabase
      .from("reading_now")
      .upsert({ device_id: pin, path: last.rel, page: null, kind: "computer", updated_at: new Date().toISOString() }, { onConflict: "device_id" });
    if (error) throw new Error(`Couldn't tell the phone: ${error.message}`);
  }
  return sentMessage(placed);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { VITE_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, STUDY_PIN: pin } = process.env;
  let line;
  try {
    if (!url || !key || !/^\d{4}$/.test(pin ?? "")) throw new Error("the repo's .env.local needs the Supabase keys and STUDY_PIN");
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    line = await sendToPhone({ files: process.argv.slice(2), dir: studyRoots().dir, supabase, pin });
  } catch (err) {
    line = `Couldn't send it: ${err.message}`;
  }
  await run("/usr/bin/osascript", ["-e", `display notification ${JSON.stringify(line)} with title "AcadKit"`]).catch(() => {});
  console.log(line);
}
