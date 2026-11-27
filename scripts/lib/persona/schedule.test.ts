import { describe, expect, it } from "vitest";
import { MIN, alertFor, inWindow, isDue, lastSlot, nextRecord, retryAfter } from "./schedule.mjs";

const at = (day: number, hh: number, mm = 0) => new Date(2026, 11, day, hh, mm);
const ran = (d: Date, extra = {}) => ({ started: d.getTime(), ended: d.getTime(), ok: true, fails: 0, retryAt: null, alerted: false, ...extra });

describe("a window", () => {
  it("holds the hours between its ends, wrapping midnight when it must", () => {
    expect(inWindow(["07:00", "22:00"], at(1, 7))).toBe(true);
    expect(inWindow(["07:00", "22:00"], at(1, 22))).toBe(false);
    expect(inWindow(["07:00", "22:00"], at(1, 3))).toBe(false);
    expect(inWindow(["22:00", "06:00"], at(1, 23, 30))).toBe(true);
    expect(inWindow(["22:00", "06:00"], at(1, 5, 59))).toBe(true);
    expect(inWindow(["22:00", "06:00"], at(1, 12))).toBe(false);
  });
});

describe("the last slot", () => {
  it("is today's latest passed time, or yesterday's last before the first", () => {
    expect(lastSlot(["07:00", "18:30"], at(2, 19))).toEqual(at(2, 18, 30));
    expect(lastSlot(["18:30", "07:00"], at(2, 9))).toEqual(at(2, 7));
    expect(lastSlot(["07:00", "18:30"], at(2, 6))).toEqual(at(1, 18, 30));
  });
});

describe("an `every` job", () => {
  const job = { name: "w", every: 10, run: async () => {} };

  it("is due before its first run and again once its interval has passed", () => {
    expect(isDue(job, null, at(1, 9))).toBe(true);
    expect(isDue(job, ran(at(1, 9)), at(1, 9, 9))).toBe(false);
    expect(isDue(job, ran(at(1, 9)), at(1, 9, 10))).toBe(true);
  });

  it("waits outside its window", () => {
    const day = { ...job, window: ["07:00", "22:00"] as [string, string] };
    expect(isDue(day, null, at(1, 23))).toBe(false);
    expect(isDue(day, null, at(2, 7))).toBe(true);
  });
});

describe("an `at` job", () => {
  const job = { name: "brief", at: ["07:00"], run: async () => {} };

  it("runs once per slot", () => {
    expect(isDue(job, ran(at(1, 7)), at(1, 7, 30))).toBe(false);
    expect(isDue(job, ran(at(1, 7)), at(2, 7))).toBe(true);
  });

  it("catches up a slot the Mac slept through, unless it's more than three hours old", () => {
    expect(isDue(job, ran(at(1, 7)), at(2, 9, 59))).toBe(true);
    expect(isDue(job, ran(at(1, 7)), at(2, 10, 1))).toBe(false);
  });
});

it("a job with no schedule runs only when asked", () => {
  expect(isDue({ name: "semester", run: async () => {} }, null, at(1, 9))).toBe(false);
});

describe("a failure", () => {
  const job = { name: "w", every: 10, run: async () => {} };

  it("retries after 1, 2, 4 … minutes, capped at the job's interval or an hour", () => {
    expect([1, 2, 3, 4, 5, 9].map((n) => retryAfter(n, job))).toEqual([1, 2, 4, 8, 10, 10]);
    expect(retryAfter(9, { name: "brief", at: ["07:00"] })).toBe(60);
  });

  it("is due again at its retry time, inside the interval", () => {
    const rec = nextRecord(ran(at(1, 9)), { started: at(1, 9, 30).getTime(), ended: at(1, 9, 30).getTime(), ok: false, note: "down" }, job);
    expect(rec.retryAt).toBe(at(1, 9, 30).getTime() + MIN);
    expect(isDue(job, rec, at(1, 9, 30))).toBe(false);
    expect(isDue(job, rec, at(1, 9, 31))).toBe(true);
  });

  it("keeps the last success and counts the streak", () => {
    let rec = ran(at(1, 9), { lastOk: at(1, 9).getTime() });
    for (let i = 1; i <= 3; i++) rec = nextRecord(rec, { started: at(1, 10, i).getTime(), ended: at(1, 10, i).getTime(), ok: false }, job);
    expect(rec).toMatchObject({ fails: 3, lastOk: at(1, 9).getTime(), alerted: true, ok: false });
    const back = nextRecord(rec, { started: at(1, 11).getTime(), ended: at(1, 11).getTime(), ok: true }, job);
    expect(back).toMatchObject({ fails: 0, lastOk: at(1, 11).getTime(), retryAt: null, alerted: false });
  });
});

describe("alerts", () => {
  const job = { name: "w", every: 10, run: async () => {} };
  const fail = (rec: ReturnType<typeof nextRecord> | null) => nextRecord(rec, { started: 0, ended: 0, ok: false }, job);

  it("say 'failing' once, at the third failure in a row, and 'fixed' after", () => {
    const one = fail(null);
    const two = fail(one);
    const three = fail(two);
    const four = fail(three);
    expect([alertFor(null, one, job), alertFor(one, two, job), alertFor(two, three, job), alertFor(three, four, job)]).toEqual([null, null, "failing", null]);
    const fixed = nextRecord(four, { started: 1, ended: 1, ok: true }, job);
    expect(alertFor(four, fixed, job)).toBe("fixed");
  });

  it("stay quiet when a short streak ends", () => {
    const one = fail(null);
    expect(alertFor(one, nextRecord(one, { started: 1, ended: 1, ok: true }, job), job)).toBeNull();
  });

  it("follow a job's own limit", () => {
    const login = { ...job, alertAfter: 1 };
    expect(alertFor(null, nextRecord(null, { started: 0, ended: 0, ok: false }, login), login)).toBe("failing");
  });
});
