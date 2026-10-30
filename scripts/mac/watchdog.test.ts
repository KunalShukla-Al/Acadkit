import { describe, expect, it } from "vitest";
import { MAX_SILENCE_MS, isStale } from "./watchdog.mjs";

describe("isStale", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");

  it("is fresh within the window", () => {
    const recent = new Date(now - 60_000).toISOString(); // a minute ago
    expect(isStale(recent, now)).toBe(false);
  });

  it("tolerates a long but healthy sync just under the window", () => {
    const beat = new Date(now - (MAX_SILENCE_MS - 60_000)).toISOString();
    expect(isStale(beat, now)).toBe(false);
  });

  it("is stale once the heartbeat passes the window", () => {
    const beat = new Date(now - (MAX_SILENCE_MS + 60_000)).toISOString();
    expect(isStale(beat, now)).toBe(true);
  });

  it("treats an unreadable heartbeat as stale", () => {
    expect(isStale("not a date", now)).toBe(true);
    expect(isStale("", now)).toBe(true);
  });
});
