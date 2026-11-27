/**
 * Run a PersonaOS engine: `python3 -m persona.<module> …` from the repo root
 * (persona/, docs/persona.md). Resolves with the last line it printed, the
 * job's note; rejects with the last line of stderr. Aborting `signal` kills it.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const lastLine = (text) => text.trim().split("\n").pop()?.trim() ?? "";

export function runPython(args, { signal, cwd = REPO, python = "python3", env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-m", ...args], { cwd, env, signal, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(lastLine(out));
      else reject(new Error(lastLine(err) || `${args[0]} exited with ${code}`));
    });
  });
}
