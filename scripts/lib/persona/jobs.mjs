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
];
