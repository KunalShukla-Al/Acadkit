import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runPython } from "./python.mjs";

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "persona-py-"));
  await mkdir(path.join(dir, "eng"));
  await writeFile(path.join(dir, "eng", "__init__.py"), "");
  await writeFile(path.join(dir, "eng", "ok.py"), 'print("reading")\nprint("3 new messages")\n');
  await writeFile(path.join(dir, "eng", "bad.py"), 'import sys\nprint("WhatsApp changed", file=sys.stderr)\nsys.exit(1)\n');
  await writeFile(path.join(dir, "eng", "slow.py"), "import time\ntime.sleep(30)\n");
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("an engine run", () => {
  it("resolves with its last line", async () => {
    expect(await runPython(["eng.ok"], { cwd: dir })).toBe("3 new messages");
  });

  it("rejects with its error", async () => {
    await expect(runPython(["eng.bad"], { cwd: dir })).rejects.toThrow("WhatsApp changed");
  });

  it("is killed when its job's signal aborts", async () => {
    const ac = new AbortController();
    const run = runPython(["eng.slow"], { cwd: dir, signal: ac.signal });
    ac.abort();
    await expect(run).rejects.toThrow(/abort/i);
  });
});
