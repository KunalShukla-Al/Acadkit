import { describe, expect, it } from "vitest";
import { say, VOICE, type Tone } from "@/lib/voice";

// Every line in a register, with its arguments filled in: numbers, a date.
const lines = (tone: Tone) =>
  Object.entries(VOICE).map(([key, copy]) => {
    const args = Array.from({ length: (copy.plain as (...a: unknown[]) => string).length }, (_, i) => (i === 0 ? 3 : "Thu, 12 Nov"));
    return [key, (say as (c: unknown, t: string, ...a: unknown[]) => string)(copy, tone, ...args)] as const;
  });

describe("the app's voice", () => {
  for (const tone of ["quiet", "brutal"] as const) {
    it(`says something in every line, with its arguments in it (${tone})`, () => {
      for (const [key, line] of lines(tone)) {
        expect(line, key).not.toContain("undefined");
        expect(line.trim(), key).not.toBe("");
      }
    });
  }

  it("never exclaims, quietly", () => {
    for (const [key, line] of lines("quiet")) expect(line, key).not.toMatch(/!/);
  });

  it("greets by the hour, with the name when there is one", () => {
    expect([3, 9, 14, 20].map((h) => say(VOICE.greeting, "brutal", h, "Kunal"))).toEqual(["still up, Kunal?", "you're awake, Kunal", "sup, Kunal", "long day, Kunal?"]);
    expect(say(VOICE.greeting, "quiet", 9, "")).toBe("Good morning");
  });

  it("falls back to the plain line where a register has none of its own", () => {
    expect(say(VOICE.titleMarks, "quiet")).toBe(say(VOICE.titleMarks, "plain"));
    expect(say(VOICE.upNext, "quiet")).toBe("Next");
    expect(say(VOICE.inClassNow, "brutal")).toBe("currently trapped");
  });

  it("agrees with itself on plurals", () => {
    expect([say(VOICE.walletUnit, "quiet", 1), say(VOICE.walletUnit, "quiet", 3)]).toEqual(["class to spare", "classes to spare"]);
  });
});
