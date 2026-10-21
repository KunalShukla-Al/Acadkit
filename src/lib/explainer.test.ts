import { describe, expect, it } from "vitest";
import { captionAt, captionUpTo, classesPerSquare, nextStep, stepDuration, totalDuration, tween } from "@/lib/explainer";

describe("playing an explainer", () => {
  it("keeps each step up long enough to read, and its sum a beat longer", () => {
    expect(stepDuration({ say: "Short." })).toBe(2500);
    expect(stepDuration({ say: "x".repeat(100) })).toBe(6300);
    expect(stepDuration({ say: "x".repeat(100), sum: "1 + 1" })).toBe(7800);
    expect(stepDuration({ say: "x".repeat(400) })).toBe(9000);
    expect(totalDuration([{ say: "Short." }, { say: "x".repeat(100) }])).toBe(8800);
  });

  it("steps forward and stops at the end", () => {
    const steps = [{ say: "a" }, { say: "b" }];
    expect([nextStep(0, steps), nextStep(1, steps)]).toEqual([1, null]);
  });

  it("counts a figure up, easing out", () => {
    expect([tween(80, 0), tween(80, 1), tween(80, 2)]).toEqual([0, 80, 80]);
    expect(tween(80, 0.5)).toBeCloseTo(70, 0);
  });
});

describe("the attendance scene", () => {
  it("fits any number of classes in 60 squares", () => {
    expect([classesPerSquare(50), classesPerSquare(60), classesPerSquare(61), classesPerSquare(130)]).toEqual([1, 1, 2, 3]);
  });
});

describe("captions", () => {
  it("bring each word out once the time to read up to it has passed", () => {
    const say = "That's 42 of 50.";
    expect(captionAt(say, 0)).toEqual({ words: ["That's", "42", "of", "50."], shown: 0 });
    expect(captionAt(say, 300).shown).toBe(1);
    // "That's " is 7 characters: the second word is out after 300 + 7 × 45 ms.
    expect(captionAt(say, 614).shown).toBe(1);
    expect(captionAt(say, 615).shown).toBe(2);
    expect(captionAt(say, 10_000).shown).toBe(4);
  });
});

describe("captions with a voice", () => {
  it("follow the words spoken so far", () => {
    const say = "That's 42 of 50.";
    expect(captionUpTo(say, 0).shown).toBe(0);
    expect(captionUpTo(say, 6).shown).toBe(1);
    expect(captionUpTo(say, 8).shown).toBe(2);
    expect(captionUpTo(say, 99).shown).toBe(4);
  });
});
