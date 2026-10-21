import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { classOf, durationOf, isOn, minutesOf, newMemos, recorder, saveSeen, startedAt } from "./recorder.mjs";

let root: string;
beforeEach(async () => (root = await mkdtemp(path.join(tmpdir(), "recorder-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("picking up Voice Memos", () => {
  it("reads when a memo started from its name, in the Mac's time", () => {
    expect(startedAt("20261103 101533-3F2A9C1B.m4a")?.getTime()).toBe(new Date(2026, 10, 3, 10, 15, 33).getTime());
    expect(startedAt("New Recording 3.m4a")).toBeNull();
  });

  it("offers new memos oldest first, not one still arriving, and not one handled already", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    for (const name of ["20261103 110000-B.m4a", "20261103 080500-A.m4a", "notes.txt"]) {
      await writeFile(path.join(root, name), "audio");
      await utimes(path.join(root, name), old, old);
    }
    await writeFile(path.join(root, "20261103 120000-C.m4a"), "still syncing");
    const stateDir = path.join(root, "state");
    const { memos, seen } = await newMemos({ dir: root, stateDir });
    expect(memos.map((m: { name: string }) => m.name)).toEqual(["20261103 080500-A.m4a", "20261103 110000-B.m4a"]);
    expect(memos[0].started).toBe(new Date(2026, 10, 3, 8, 5, 0).toISOString());
    await saveSeen({ ...seen, "20261103 080500-A.m4a": { size: 5 } }, stateDir);
    expect((await newMemos({ dir: root, stateDir })).memos.map((m: { name: string }) => m.name)).toEqual(["20261103 110000-B.m4a"]);
  });

  it("is off until RECORDER=on", () => {
    expect([isOn({}), isOn({ RECORDER: "on" }), isOn({ RECORDER: "1" })]).toEqual([false, true, false]);
  });
});

describe("the tick's recorder step", () => {
  it("does nothing while off, and says once that it can't read Voice Memos", async () => {
    const lines: string[] = [];
    expect(await recorder({ env: {}, dir: path.join(root, "none"), stateDir: path.join(root, "state"), log: (l: string) => lines.push(l) })).toEqual([]);
    expect(lines).toEqual([]);
    await recorder({ env: { RECORDER: "on" }, dir: path.join(root, "none"), stateDir: path.join(root, "state"), log: (l: string) => lines.push(l) });
    await recorder({ env: { RECORDER: "on" }, dir: path.join(root, "none"), stateDir: path.join(root, "state"), log: (l: string) => lines.push(l) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^ {2}Recorder: can't read Voice Memos \(ENOENT\): give \/bin\/bash Full Disk Access/);
    expect(existsSync(path.join(root, "state", "warned-access"))).toBe(true);
  });

  it("picks up each new memo once", async () => {
    const old = new Date(Date.now() - 10 * 60_000);
    await writeFile(path.join(root, "20261103 080500-A.m4a"), "audio");
    await utimes(path.join(root, "20261103 080500-A.m4a"), old, old);
    const lines: string[] = [];
    const opts = { env: { RECORDER: "on" }, dir: root, stateDir: path.join(root, "state"), log: (l: string) => lines.push(l) };
    expect((await recorder(opts)).map((m: { name: string }) => m.name)).toEqual(["20261103 080500-A.m4a"]);
    expect(await recorder(opts)).toEqual([]);
    expect(lines).toEqual(["  Recorder: picked up 20261103 080500-A.m4a"]);
  });

  it("says a length plainly, and reads one with afinfo", async () => {
    expect([minutesOf(18), minutesOf(2880), minutesOf(3720)]).toEqual(["18 s", "48 min", "1 h 02 min"]);
    const run = async () => ({ stdout: "File type ID: m4af\nestimated duration: 2879.6 sec\n" });
    expect(await durationOf("x.m4a", run)).toBe(2880);
  });
});

describe("which class a recording is of", () => {
  const cls = (code: string, start: string, end: string, type = "theory") => ({ code, short: code, name: code, type, start, end });
  const day = [cls("TBVP", "08:00", "08:50"), cls("FDS", "08:50", "09:40"), cls("DSA", "10:00", "11:40", "lab")];

  it("is the class it overlaps most, when that is most of either", () => {
    // 08:02 for 47 min: all TBVP, a minute of FDS.
    expect(classOf({ start: "08:02", seconds: 47 * 60, classes: day })?.code).toBe("TBVP");
    // 08:30 for 60 min: 20 of TBVP, 40 of FDS.
    expect(classOf({ start: "08:30", seconds: 60 * 60, classes: day })?.code).toBe("FDS");
    // Half the lab is enough.
    expect(classOf({ start: "10:40", seconds: 60 * 60, classes: day })).toMatchObject({ code: "DSA", type: "lab", start: "10:00", end: "11:40" });
  });

  it("is none out of class hours, or for a brush with one", () => {
    expect(classOf({ start: "12:30", seconds: 30 * 60, classes: day })).toBeNull();
    // Ten minutes into the break, two of FDS.
    expect(classOf({ start: "09:38", seconds: 20 * 60, classes: day })).toBeNull();
  });
});

describe("the recorder's steps", () => {
  const memo = async (name: string) => {
    const old = new Date(Date.now() - 10 * 60_000);
    await writeFile(path.join(root, name), "audio");
    await utimes(path.join(root, name), old, old);
  };

  it("waits, saying so, while whisper is missing", async () => {
    await memo("20261103 080500-A.m4a");
    const lines: string[] = [];
    const out = await recorder({ env: { RECORDER: "on" }, dir: root, stateDir: path.join(root, "state"), log: (l: string) => lines.push(l), missing: () => "whisper.cpp (brew install whisper-cpp)" });
    expect(out).toEqual([]);
    expect(lines).toEqual(["  Recorder: waiting for whisper.cpp (brew install whisper-cpp)"]);
  });

  it("handles one memo a tick, and tries one that failed again", async () => {
    await memo("20261103 080500-A.m4a");
    await memo("20261103 100500-B.m4a");
    const lines: string[] = [];
    let fail = true;
    const handle = async () => {
      if (fail) throw new Error("whisper exited 1");
      return { date: "2026-11-03", class: { short: "OS", start: "08:00", end: "08:50" }, words: 4200, took: 190 };
    };
    const opts = { env: { RECORDER: "on" }, dir: root, stateDir: path.join(root, "state"), log: (l: string) => lines.push(l), handle };
    expect(await recorder(opts)).toEqual([]);
    fail = false;
    expect((await recorder(opts)).map((m: { name: string }) => m.name)).toEqual(["20261103 080500-A.m4a"]);
    expect((await recorder(opts)).map((m: { name: string }) => m.name)).toEqual(["20261103 100500-B.m4a"]);
    expect(lines).toEqual([
      "  Recorder: couldn't handle 20261103 080500-A.m4a: whisper exited 1; trying again next tick",
      "  Recorder: picked up 20261103 080500-A.m4a → OS 08:00–08:50, 4200 words in 190 s",
      "  Recorder: picked up 20261103 100500-B.m4a → OS 08:00–08:50, 4200 words in 190 s",
    ]);
  });
});
