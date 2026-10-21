import { describe, expect, it } from "vitest";
import { movedTo, screenOf, SCREENS, studyPath } from "@/lib/screens";

describe("the five tabs", () => {
  it("own their pages, under their roots and below", () => {
    expect(SCREENS.map((s) => screenOf(s.to))).toEqual(["today", "timetable", "attendance", "marks", "study"]);
    expect(["/deadlines", "/log", "/marks"].map(screenOf)).toEqual(["today", "attendance", "marks"]);
    expect(["/subject/21CSC202J", "/practice/21CSC202J", "/view", "/lecture/9"].map(screenOf)).toEqual(Array(4).fill("study"));
  });

  it("light no tab for what the ball and the top bar open", () => {
    expect(["/runup", "/runup/2026-11-20", "/runup/event/3", "/calendar", "/skips", "/settings", "/history", "/wrapped", "/electives"].map(screenOf)).toEqual(Array(9).fill(null));
  });

  it("put the study folder on Study", () => {
    expect(studyPath("Operating_Systems/02_Notes")).toBe("/study?dir=Operating_Systems%2F02_Notes");
    expect(studyPath()).toBe("/study");
  });

  it("take an old link to the page it was on, the rest of its query and its hash kept", () => {
    expect(movedTo("/grades")).toBe("/attendance");
    expect(movedTo("/grades", "?show=marks")).toBe("/marks");
    expect(movedTo("/grades", "?from=reminder&show=skips")).toBe("/skips?from=reminder");
    expect(movedTo("/plan")).toBe("/calendar");
    expect(movedTo("/plan", "?show=runup")).toBe("/runup");
    expect(movedTo("/plan", "?show=deadlines")).toBe("/deadlines");
    expect(movedTo("/you", "", "#notifications")).toBe("/settings#notifications");
    expect(movedTo("/you", "?show=history")).toBe("/history");
    expect(movedTo("/survival")).toBe("/skips");
    expect(movedTo("/files", "?dir=Operating_Systems")).toBe("/study?dir=Operating_Systems");
  });

  it("leave the pages that stay where they are", () => {
    expect(["/", "/attendance", "/marks", "/timetable", "/runup", "/runup/2026-11-20", "/settings", "/subject/21CSC202J", "/view"].map((p) => movedTo(p))).toEqual(Array(9).fill(null));
  });

  it("match whole path parts", () => {
    expect(screenOf("/marksheet")).toBeNull();
    expect(screenOf("/somewhere")).toBeNull();
  });
});
