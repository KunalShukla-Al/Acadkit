import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, render, syncState } from "./menubar.mjs";
import { isPaused } from "../lib/autopilot.mjs";

const cls = (short: string, start: string, end: string, room: string | null = null) => ({ short, start, end, room, code: short, name: short, type: "theory", attendance: null, canSkip: 0, mustAttend: false });
const DAY = {
  date: "2026-10-07",
  dayOrder: 3,
  holiday: null,
  next: null,
  classes: [cls("TBVP", "08:00", "08:50", "TP300"), cls("OS", "10:00", "10:50", "TP304"), cls("DSA", "11:00", "11:50")],
  say: "Day Order 3: 3 classes from 8:00 AM, the first TBVP in TP300.",
};
const idle = { syncing: false, lastSync: Date.now() - 3 * 60_000, failedAt: null };

describe("the menu bar", () => {
  it("shows the next class, or the one on now, in the bar", () => {
    expect(render({ day: DAY, time: "07:30", sync: idle, autopilot: "on" }).split("\n")[0]).toBe("DO 3 · TBVP 8:00 AM");
    expect(render({ day: DAY, time: "10:20", sync: idle, autopilot: "on" }).split("\n")[0]).toBe("OS now · DSA 11:00 AM");
    expect(render({ day: DAY, time: "12:00", sync: idle, autopilot: "on" }).split("\n")[0]).toBe("DO 3 · done");
    expect(render({ day: { ...DAY, dayOrder: null, holiday: "Diwali", classes: [] }, time: "09:00", sync: idle, autopilot: "on" }).split("\n")[0]).toBe("Holiday");
    expect(render({ day: DAY, time: "07:30", sync: { ...idle, syncing: true }, autopilot: "on" }).split("\n")[0]).toBe("DO 3 · TBVP 8:00 AM ↻");
  });

  it("says what Today says: the day's sentence, the classes greyed once over, then the sync and Autopilot", () => {
    expect(render({ day: DAY, time: "10:20", sync: idle, autopilot: "paused" }).split("\n")).toEqual([
      "OS now · DSA 11:00 AM",
      "---",
      "Day Order 3: 3 classes from 8:00 AM, the first TBVP in TP300.",
      "Wednesday, 7 October | color=gray",
      "TBVP 8:00 AM–8:50 AM · TP300 | color=gray",
      "OS 10:00 AM–10:50 AM · TP304 · now",
      "DSA 11:00 AM–11:50 AM",
      "Open Today | href=https://acadkit.vercel.app/",
      "---",
      "Synced 3 min ago",
      "Autopilot is paused",
    ]);
  });

  it("has Today's Mac line, with each job in its submenu, a failure in red", () => {
    const now = Date.parse("2026-10-07T05:00:00Z");
    const jobs = { version: 1, jobs: { sync: { at: now - 4 * 60_000, ok: true, note: "412 files" }, recorder: { at: now - 20 * 60_000, ok: false, note: "whisper-cli is missing" } } };
    const out = render({ day: DAY, time: "10:20", sync: idle, autopilot: "on", jobs, now }).split("\n");
    expect(out).toContain("Class recorder failed on your Mac · 20 min ago | color=red");
    expect(out).toContain("--Study folder sync · 4 min ago · 412 files");
    expect(out).toContain("--Class recorder · failed 20 min ago · whisper-cli is missing | color=red");
    expect(out.some((l) => l.startsWith("Synced "))).toBe(false);
  });

  it("offers Sync now and Pause or Resume Autopilot, run by the plugin itself", () => {
    const self = "/Users/k/SwiftBar/acadkit.1m.sh";
    const on = render({ day: DAY, time: "10:20", sync: idle, autopilot: "on", self }).split("\n");
    expect(on).toContain(`Sync now | bash="${self}" param1=sync terminal=false refresh=true`);
    expect(on).toContain(`Pause Autopilot | bash="${self}" param1=pause terminal=false refresh=true`);
    const paused = render({ day: DAY, time: "10:20", sync: { ...idle, syncing: true }, autopilot: "paused", self }).split("\n");
    expect(paused).toContain(`Resume Autopilot | bash="${self}" param1=resume terminal=false refresh=true`);
    expect(paused.some((l) => l.startsWith("Sync now"))).toBe(false);
  });

  it("says when the last sync failed, and works without the day", () => {
    const out = render({ day: null, time: "10:20", sync: { syncing: false, lastSync: null, failedAt: "10:42" }, autopilot: "waiting" }).split("\n");
    expect(out[0]).toBe("AcadKit");
    expect(out).toContain("Last sync failed at 10:42 | color=red");
    expect(out).toContain("Autopilot is waiting for Ollama");
  });

});

describe("the menu's actions", () => {
  it("pause Autopilot until resumed", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "menubar-act-"));
    try {
      await act("pause", { stateDir: dir });
      expect(existsSync(path.join(dir, "autopilot", "paused"))).toBe(true);
      expect(isPaused({}, path.join(dir, "autopilot"))).toBe(true);
      await act("resume", { stateDir: dir });
      expect(isPaused({}, path.join(dir, "autopilot"))).toBe(false);
      expect(isPaused({ AUTOPILOT: "off" }, path.join(dir, "autopilot"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the sync's state, from the tick's files", () => {
  let dir: string;
  beforeEach(async () => (dir = await mkdtemp(path.join(tmpdir(), "menubar-"))));
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("is syncing while the lock is held, and not with a stale lock", async () => {
    await mkdir(path.join(dir, "sync.lock"));
    expect((await syncState({ stateDir: dir, log: path.join(dir, "none.log") })).syncing).toBe(true);
    const old = new Date(Date.now() - 4 * 3_600_000);
    await utimes(path.join(dir, "sync.lock"), old, old);
    expect((await syncState({ stateDir: dir, log: path.join(dir, "none.log") })).syncing).toBe(false);
  });

  it("knows the last sync, and a failure since", async () => {
    await writeFile(path.join(dir, "last-sync"), "");
    const log = path.join(dir, "study-sync.log");
    await writeFile(log, "2026-10-07 09:58:01 ok (uploaded 2)\n2026-10-07 10:42:13 FAILED (exit 1); will retry next tick\n");
    expect(await syncState({ stateDir: dir, log })).toMatchObject({ syncing: false, failedAt: "10:42" });
    await writeFile(log, "2026-10-07 10:42:13 FAILED (exit 1); will retry next tick\n2026-10-07 10:45:02 ok (uploaded 0)\n");
    const s = await syncState({ stateDir: dir, log });
    expect(s.failedAt).toBeNull();
    expect(s.lastSync).toBeGreaterThan(Date.now() - 60_000);
  });
});

describe("Continue in the menu bar", () => {
  it("offers the page you were just reading on your phone, opened in the app", async () => {
    const { render } = await import("./menubar.mjs");
    const now = Date.parse("2026-11-09T10:30:00Z");
    const sync = { syncing: false, lastSync: null, failedAt: null };
    const reading = { path: "Operating_Systems/02_Notes/Unit_3/CPU Slides.pptx", page: 24, kind: "phone", updated_at: "2026-11-09T10:20:00Z" };
    const out = render({ day: null, time: "16:00", sync, autopilot: "on", reading, now, appUrl: "https://app" });
    expect(out).toContain("Continue CPU Slides at p. 24 | href=https://app/view?path=Operating_Systems%2F02_Notes%2FUnit_3%2FCPU+Slides.pptx&page=24");
    expect(render({ day: null, time: "16:00", sync, autopilot: "on", reading: { ...reading, kind: "computer" }, now })).not.toContain("Continue");
  });
});
