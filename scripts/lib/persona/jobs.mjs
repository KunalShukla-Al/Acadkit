/**
 * Every PersonaOS job (docs/persona.md). Each engine adds its jobs here:
 *
 *   { name, every | at, window?, timeoutMin?, alertAfter?, graceMin?, run(ctx) }
 *
 * `run` gets { signal, now, log, spendClaude } and may return a short note.
 * It should stop when `signal` aborts at the time limit.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PERSONA_DIR } from "./store.mjs";

export const HEARTBEAT = path.join(PERSONA_DIR, "heartbeat");

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
];
