import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ignored, raceTimeout, scheduler, watchedFolders } from "./watch.mjs";

describe("watchedFolders", () => {
  it("watches STUDY_DIR, and STUDY_NEXT_DIR when it's another folder", () => {
    expect(watchedFolders("STUDY_DIR=~/Documents/SRM_Sem3\nSTUDY_NEXT_DIR=~/Documents/SRM_Sem4\n", "/Users/k")).toEqual([
      "/Users/k/Documents/SRM_Sem3",
      "/Users/k/Documents/SRM_Sem4",
    ]);
    expect(watchedFolders("STUDY_DIR=~/Documents/SRM_Sem4\nSTUDY_NEXT_DIR=~/Documents/SRM_Sem4\n", "/Users/k")).toEqual(["/Users/k/Documents/SRM_Sem4"]);
    expect(watchedFolders("", "/Users/k")).toEqual(["/Users/k/Documents/SRM_Sem3"]);
  });

  it("adds Autopilot's folders unless it is off", () => {
    expect(watchedFolders('AUTOPILOT_FOLDERS="~/Downloads"\n', "/Users/k")).toEqual(["/Users/k/Documents/SRM_Sem3", "/Users/k/Downloads"]);
    expect(watchedFolders('AUTOPILOT_FOLDERS="~/Downloads"\nAUTOPILOT=off\n', "/Users/k")).toEqual(["/Users/k/Documents/SRM_Sem3"]);
  });
});

describe("ignored", () => {
  it("skips what the sync never sees", () => {
    for (const rel of [".DS_Store", "OS/.notes.pdf.icloud", "OS/~$Unit2.docx", "_src/__pycache__/x.pyc", "_scans/page.jpg"]) expect(ignored(rel)).toBe(true);
    for (const rel of ["OS/Unit_2/notes.pdf", "_src/acadkit_runup.json", "_src/_html/OS/notes.html"]) expect(ignored(rel)).toBe(false);
  });
});

describe("scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A run that takes `ms` of fake time. */
  function runs(ms = 0) {
    const calls: boolean[] = [];
    const run = vi.fn(async ({ afterChange }: { afterChange: boolean }) => {
      calls.push(afterChange);
      if (ms) await new Promise((r) => setTimeout(r, ms));
    });
    return { run, calls };
  }

  it("runs once 10 s after the last change", async () => {
    const { run, calls } = runs();
    const s = scheduler({ run });
    s.change();
    await vi.advanceTimersByTimeAsync(6_000);
    s.change();
    await vi.advanceTimersByTimeAsync(9_000);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toEqual([true]);
    s.stop();
  });

  it("runs every 3 minutes without a change", async () => {
    const { run, calls } = runs();
    const s = scheduler({ run });
    await vi.advanceTimersByTimeAsync(360_000);
    expect(calls).toEqual([false, false]);
    s.stop();
  });

  it("runs once more after a run that a change arrived during", async () => {
    const { run, calls } = runs(30_000);
    const s = scheduler({ run });
    s.change();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual([true]);
    s.change();
    s.change();
    await vi.advanceTimersByTimeAsync(10_000);
    // The second quiet window ended mid-run: it waits, then runs once.
    expect(calls).toEqual([true]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toEqual([true, true]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual([true, true]);
    s.stop();
  });

  it("runs a request from the phone at once, or straight after the run going", async () => {
    const { run, calls } = runs(30_000);
    const s = scheduler({ run });
    void s.request();
    expect(calls).toEqual([false]);
    void s.request();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(calls).toEqual([false, false]);
    // A change during the run that a request is also waiting on: one run, as a change.
    s.change();
    await vi.advanceTimersByTimeAsync(10_000);
    void s.request();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toEqual([false, false, true]);
    s.stop();
  });

  it("skips a 3-minute tick while a run is going", async () => {
    const { run, calls } = runs(200_000);
    const s = scheduler({ run });
    void s.tick();
    await vi.advanceTimersByTimeAsync(190_000);
    expect(calls).toEqual([false]);
    s.stop();
  });

  it("gives up on a run that overruns the timeout, then recovers", async () => {
    const onTimeout = vi.fn();
    const run = vi.fn(() => new Promise<void>(() => {})); // never settles
    const s = scheduler({ run, timeoutMs: 60_000, onTimeout });
    void s.tick();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    // The first run never settled, yet the scheduler is free: a later tick runs.
    void s.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    s.stop();
  });

  it("leaves a run that finishes before the timeout alone", async () => {
    const onTimeout = vi.fn();
    const { run, calls } = runs(5_000);
    const s = scheduler({ run, timeoutMs: 60_000, onTimeout });
    void s.tick();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(calls).toEqual([false]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
    s.stop();
  });
});

describe("raceTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves early and fires onTimeout when the promise hangs", async () => {
    const onTimeout = vi.fn();
    let done = false;
    void raceTimeout(new Promise<void>(() => {}), 1_000, onTimeout).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("resolves when the promise settles first, without onTimeout", async () => {
    const onTimeout = vi.fn();
    let done = false;
    void raceTimeout(Promise.resolve(), 1_000, onTimeout).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
