import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { store, takeLock } from "./store.mjs";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "persona-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("a job's lock", () => {
  it("is held by one process at a time", async () => {
    const file = await takeLock(dir, "mail", 111, () => true);
    expect(await readFile(file!, "utf8")).toBe("111");
    expect(await takeLock(dir, "mail", 222, () => true)).toBeNull();
  });

  it("is taken over from a process that has gone", async () => {
    await writeFile(path.join(dir, "mail.lock"), "111");
    const file = await takeLock(dir, "mail", 222, (pid: number) => pid !== 111);
    expect(await readFile(file!, "utf8")).toBe("222");
  });

  it("is free again once dropped", async () => {
    const s = store(dir);
    const file = await s.lock("mail");
    expect(await s.lock("mail")).toBeNull();
    await s.unlock(file!);
    expect(await s.lock("mail")).not.toBeNull();
  });
});

describe("a job's record", () => {
  it("is null before the first run and reads back as written", async () => {
    const s = store(dir);
    expect(await s.read("mail")).toBeNull();
    await s.write("mail", { ok: true, fails: 0 });
    expect(await s.read("mail")).toEqual({ ok: true, fails: 0 });
  });
});
