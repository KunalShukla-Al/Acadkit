import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isOn, lastNight, nightOf, onCharger, saveNight, untilJob } from "./night-shift.mjs";

const at = (day: number, hh: number, mm = 0) => new Date(2026, 10, day, hh, mm);

describe("the night", () => {
  it("is named by the date it began, and is none in the day", () => {
    expect(nightOf(at(4, 23, 30))).toBe("2026-11-04");
    expect(nightOf(at(5, 2))).toBe("2026-11-04");
    expect(nightOf(at(1, 4))).toBe("2026-10-31");
    expect(nightOf(at(5, 6, 30))).toBeNull();
    expect(nightOf(at(5, 14))).toBeNull();
  });

  it("waits for 02:00, and not at all once it has passed", () => {
    expect(untilJob(at(4, 23))).toBe(3 * 3_600_000);
    expect(untilJob(at(5, 1, 45))).toBe(15 * 60_000);
    expect(untilJob(at(5, 2))).toBe(0);
    expect(untilJob(at(5, 4, 10))).toBe(0);
  });

  it("is on unless NIGHT_SHIFT=off", () => {
    expect([isOn({}), isOn({ NIGHT_SHIFT: "off" }), isOn({ NIGHT_SHIFT: "on" })]).toEqual([true, false, true]);
  });
});

describe("the charger", () => {
  it("is read from pmset", async () => {
    const said = (stdout: string) => async () => ({ stdout });
    expect(await onCharger(said("Now drawing from 'AC Power'\n -InternalBattery-0 100%; charged"))).toBe(true);
    expect(await onCharger(said("Now drawing from 'Battery Power'\n -InternalBattery-0 64%; discharging"))).toBe(false);
    expect(await onCharger(async () => Promise.reject(new Error("no pmset")))).toBe(false);
  });
});

describe("what last night did", () => {
  it("is kept on the Mac", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "night-"));
    const file = path.join(dir, "night-shift.json");
    expect(await lastNight(file)).toBeNull();
    await saveNight({ night: "2026-11-04", skipped: "on battery" }, file);
    expect(await lastNight(file)).toEqual({ night: "2026-11-04", skipped: "on battery" });
    await rm(dir, { recursive: true, force: true });
  });
});
