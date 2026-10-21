#!/usr/bin/env node
/**
 * Move AcadKit to the next semester's study folder (scripts/lib/semester.mjs).
 *
 *   npm run semester:switch -- 4              # ~/Documents/SRM_Sem4, asks first
 *   npm run semester:switch -- 4 --dry-run    # what it would do, nothing changed
 *   npm run semester:switch -- 4 --keep-old   # switch, but leave the old folder and its data
 *   npm run semester:switch -- --to ~/Documents/Some_Folder --yes
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { expandHome, semesterDir, switchSemester, syncRunner } from "./lib/semester.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const yes = args.includes("--yes");
const keepOld = args.includes("--keep-old");
const toArg = args.includes("--to") ? args[args.indexOf("--to") + 1] : null;
const n = args.find((a) => /^\d{1,2}$/.test(a));
if (!toArg && !n) {
  console.error("Which semester? e.g. npm run semester:switch -- 4   (or --to <folder>; add --dry-run to look first)");
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const pin = process.env.STUDY_PIN;
if (!url || !key || !/^\d{4}$/.test(pin ?? "")) {
  console.error("Add VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN to .env.local.");
  process.exit(1);
}
const from = expandHome(process.env.STUDY_DIR || "~/Documents/SRM_Sem3");
const to = toArg ? path.resolve(expandHome(toArg)) : semesterDir(n);

console.log(`${dryRun ? "Dry run: " : ""}${path.basename(from)} → ${path.basename(to)}`);
if (!dryRun && !yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    keepOld
      ? `This points AcadKit at ${to} and syncs it; ${path.basename(from)} and its data stay. Go ahead? [y/N] `
      : `This points AcadKit at ${to} and syncs it, then deletes ${path.basename(from)}'s files, search index and progress from AcadKit and moves the folder to the Trash. Archive the semester in the app first (History) to keep its attendance and marks. Go ahead? [y/N] `
  );
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    console.log("Nothing changed.");
    process.exit(0);
  }
}

const supabase = createClient(url, key, { auth: { persistSession: false } });
try {
  await switchSemester({ supabase, pin, from, to, envFile: path.join(REPO, ".env.local"), runSync: syncRunner(REPO, { echo: true }), dryRun, removeOld: !keepOld });
  if (!dryRun)
    console.log(
      "\nIn the app: History → Archive this semester → Start the new semester (clears the old subjects, attendance and marks), then set up the new subjects from the curriculum."
    );
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
