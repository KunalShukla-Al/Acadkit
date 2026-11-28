/**
 * Every PersonaOS job (docs/persona.md). Each engine adds its jobs here:
 *
 *   { name, every | at, window?, timeoutMin?, alertAfter?, graceMin?, run(ctx) }
 *
 * `run` gets { signal, now, log, spendClaude } and may return a short note.
 * It should stop when `signal` aborts at the time limit.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { studyRoots } from "../roots.mjs";
import { backend } from "./backend.mjs";
import { publishBrief, publishPhone } from "./phone.mjs";
import { alertOnLogout, portalStatus, uploadAttendance } from "./portal.mjs";
import { runPython } from "./python.mjs";
import { PERSONA_DIR } from "./store.mjs";

export const HEARTBEAT = path.join(PERSONA_DIR, "heartbeat");
export const WHATSAPP_STATUS = path.join(PERSONA_DIR, "whatsapp", "status.json");

/**
 * The WhatsApp read's outcome (scripts/mac/whatsapp-read.sh, run by the tick's bash every 10 min):
 * its note, or an error when it failed or has gone quiet for half an hour.
 */
export async function readerStatus(file, now) {
  const s = JSON.parse(await readFile(file, "utf8").catch(() => "null"));
  if (!s) throw new Error("the WhatsApp read hasn't run yet (scripts/mac/whatsapp-read.sh)");
  const quiet = Math.round((now.getTime() - Date.parse(s.at)) / 60_000);
  if (!(quiet <= 30)) throw new Error(`the WhatsApp read last ran ${quiet} min ago`);
  if (!s.ok) throw new Error(s.note);
  return s.note;
}

const suggestions = () => path.join(studyRoots().dir, "_src", "persona_suggestions.json");
const runup = () => path.join(studyRoots().dir, "_src", "acadkit_runup.json");

export const JOBS = [
  {
    // Proof of life: the time the orchestrator last ticked through its jobs.
    name: "heartbeat",
    every: 10,
    timeoutMin: 1,
    run: async ({ now }) => {
      await mkdir(PERSONA_DIR, { recursive: true });
      await writeFile(HEARTBEAT, now().toISOString());
    },
  },
  {
    // New messages from the semester pack's WhatsApp groups, read in bash (persona/whatsapp.py); this reports how it went.
    name: "whatsapp",
    every: 10,
    timeoutMin: 1,
    run: ({ now }) => readerStatus(WHATSAPP_STATUS, now()),
  },
  {
    // Dated items in those messages → _src/persona_suggestions.json, offered in the app by the sync (persona/deadlines).
    name: "deadlines",
    every: 15,
    timeoutMin: 3,
    run: ({ signal }) => runPython(["persona.deadlines", "run"], { signal }),
  },
  {
    // Mercor, GitHub, job-board and course mail from my Gmail accounts, as signals; subjects only (persona/gmail.py).
    name: "gmail",
    every: 15,
    timeoutMin: 3,
    run: ({ signal }) => runPython(["persona.gmail", "collect"], { signal }),
  },
  {
    // My open pull requests, their checks, and the days I pushed (persona/github.py).
    name: "github",
    every: 60,
    timeoutMin: 3,
    run: ({ signal }) => runPython(["persona.github"], { signal }),
  },
  {
    // The class groups' recent messages as _src/_persona/messages.md, for the Desk's Ask (persona/export.py).
    name: "export",
    every: 30,
    timeoutMin: 2,
    run: ({ signal }) => runPython(["persona.export"], { signal }),
  },
  {
    // The Student Portal's attendance, read in my own logged-in Chrome tab by the tick's bash, into AcadKit (portal.mjs).
    name: "portal",
    every: 15,
    timeoutMin: 2,
    run: async () => {
      const read = await portalStatus();
      const saved = await uploadAttendance(backend());
      const alert = await alertOnLogout(backend());
      return [read, saved, alert].filter(Boolean).join("; ");
    },
  },
  {
    // The calendar my iPhone subscribes to and the widget's data (phone.mjs).
    name: "phone",
    every: 30,
    timeoutMin: 2,
    run: ({ now }) => publishPhone({ ...backend(), now: now(), suggestionsFile: suggestions(), runupFile: runup() }),
  },
  {
    // The morning brief, pushed by send-reminders from 07:00 (phone.mjs). Asleep at 06:30, it runs at wake.
    name: "brief",
    at: ["06:30"],
    graceMin: 270,
    timeoutMin: 2,
    run: ({ now }) => publishBrief({ ...backend(), now: now(), suggestionsFile: suggestions(), runupFile: runup() }),
  },
];
