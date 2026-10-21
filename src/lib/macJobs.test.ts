import { describe, expect, it } from "vitest";
import { ago, macLine, type MacJobsData } from "@/lib/macJobs";

const NOW = Date.parse("2026-11-12T10:00:00Z");
const MIN = 60_000;
const data = (jobs: MacJobsData["jobs"]): MacJobsData => ({ version: 1, jobs });

describe("the Mac line", () => {
  it("says it's keeping up, with when it last synced", () => {
    expect(macLine(data({ sync: { at: NOW - 4 * MIN, ok: true }, autopilot: { at: NOW - 70 * MIN, ok: true, note: "paused" } }), NOW)).toEqual({
      text: "Your Mac is keeping up",
      value: "synced 4 min ago",
      tone: "ink",
    });
  });

  it("names a job that failed before anything else", () => {
    expect(macLine(data({ sync: { at: NOW - 2 * 24 * 60 * MIN, ok: true }, night: { at: NOW - 8 * 60 * MIN, ok: false, note: "x" } }), NOW)).toEqual({
      text: "Night shift failed on your Mac",
      value: "8 h ago",
      tone: "bad",
    });
  });

  it("warns when a day has gone by without a sync", () => {
    expect(macLine(data({ sync: { at: NOW - 30 * 60 * MIN, ok: true } }), NOW)).toMatchObject({ text: "Your Mac last synced", value: "yesterday", tone: "warn" });
  });

  it("says nothing before the Mac has", () => {
    expect([macLine(null, NOW), macLine(data({}), NOW)]).toEqual([null, null]);
  });

  it("says how long ago in words that fit a line", () => {
    expect([ago(20_000), ago(4 * MIN), ago(150 * MIN), ago(26 * 60 * MIN), ago(80 * 60 * MIN)]).toEqual(["just now", "4 min ago", "2 h ago", "yesterday", "3 days ago"]);
  });
});
