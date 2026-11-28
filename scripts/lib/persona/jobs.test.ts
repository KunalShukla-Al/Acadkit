import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readerStatus } from "./jobs.mjs";

let dir: string;
let file: string;
const now = new Date("2026-11-28T10:30:00Z");
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "persona-jobs-"));
  file = path.join(dir, "status.json");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the WhatsApp read's status", () => {
  it("passes its note on", async () => {
    await writeFile(file, JSON.stringify({ at: "2026-11-28T10:25:00Z", ok: true, note: "3 new messages from 2 groups" }));
    expect(await readerStatus(file, now)).toBe("3 new messages from 2 groups");
  });

  it("fails with the read's own error", async () => {
    await writeFile(file, JSON.stringify({ at: "2026-11-28T10:25:00Z", ok: false, note: "can't read WhatsApp's database: give /bin/bash Full Disk Access" }));
    await expect(readerStatus(file, now)).rejects.toThrow("Full Disk Access");
  });

  it("fails when the read has gone quiet or never ran", async () => {
    await writeFile(file, JSON.stringify({ at: "2026-11-28T09:40:00Z", ok: true, note: "fine" }));
    await expect(readerStatus(file, now)).rejects.toThrow("last ran 50 min ago");
    await expect(readerStatus(path.join(dir, "none.json"), now)).rejects.toThrow("hasn't run yet");
  });
});
