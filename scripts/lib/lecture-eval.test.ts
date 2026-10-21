import { describe, expect, it } from "vitest";
import { deckIs, joinSpoken, pickSlides, report, scoreLecture, scriptOf, truthAt, twinsOf, wavData, wavFile } from "./lecture-eval.mjs";

describe("stand-in lectures", () => {
  it("walk evenly through the slides with something to say", () => {
    const slides = Array.from({ length: 20 }, (_, i) => ({ page: i + 1, text: i % 4 === 3 ? "Thanks" : "x".repeat(200) }));
    expect(pickSlides(slides, 4).map((s: { page: number }) => s.page)).toEqual([1, 7, 13, 19]);
    expect(pickSlides(slides.slice(0, 3), 4)).toHaveLength(3);
  });

  it("put an aside after the third slide and after the sixth", () => {
    const said = [1, 2, 3, 4, 5, 6, 7].map((page) => ({ page, said: `s${page}` }));
    expect(scriptOf(said, ["a1", "a2"]).map((p: { page: number | null; text: string }) => p.page ?? p.text)).toEqual([1, 2, 3, "a1", 4, 5, 6, "a2", 7]);
  });

  it("are spoken into one WAV, with when each piece was on", () => {
    const pcm = (seconds: number) => Buffer.alloc(seconds * 16000 * 2, 1);
    const { pcm: joined, timeline } = joinSpoken([{ page: 3, pcm: pcm(2) }, { page: null, pcm: pcm(1) }], { gap: 0.5 });
    expect(timeline).toEqual([{ page: 3, start: 0, end: 2 }, { page: null, start: 2.5, end: 3.5 }]);
    expect(wavData(wavFile(joined)).length).toBe(joined.length);
  });
});

describe("scoring", () => {
  const timeline = [{ page: 3, start: 0, end: 50 }, { page: null, start: 51, end: 70 }, { page: 9, start: 71, end: 130 }];

  it("takes a moment's truth from what was on for most of it", () => {
    expect([truthAt(timeline, 0, 60), truthAt(timeline, 45, 75), truthAt(timeline, 60, 125)]).toEqual([3, null, 9]);
  });

  const m = (start: number, end: number, page: number | null) => ({ start, end, page });
  const moments = [m(0, 40, 3), m(40, 52, 4), m(52, 70, null), m(70, 100, null), m(100, 130, 9)];
  const axis = (i: number) => [0, 1, 2].map((k) => (k === i ? 1 : 0));

  it("counts right slides, near ones, dropped ones and asides kept off", () => {
    expect(scoreLecture({ moments, timeline, twins: (p: number) => [p] })).toEqual({ moments: 5, onSlide: 4, right: 2, near: 3, dropped: 1, asides: 1, keptOff: 1 });
    expect(scoreLecture({ moments, timeline, twins: () => [] })).toMatchObject({ right: 0, near: 0 });
  });

  it("counts a slide's copy in another deck as the slide", () => {
    // The right deck's 3 and 9 are the chosen deck's 13 and 19.
    const right = [{ page: 3, vector: axis(0) }, { page: 9, vector: axis(1) }];
    const copy = [{ page: 13, vector: axis(0) }, { page: 19, vector: axis(1) }, { page: 20, vector: axis(2) }];
    const twins = twinsOf(right, copy, false);
    expect([twins(3), twins(9), twins(5)]).toEqual([[13], [19], []]);
    expect(twinsOf(right, right, true)(9)).toEqual([9]);
    const shifted = moments.map((x) => (x.page ? { ...x, page: x.page + 10 } : x));
    expect(scoreLecture({ moments: shifted, timeline, twins })).toMatchObject({ right: 2, near: 3 });
    expect(deckIs({ deck: "a", chosen: "b", timeline, twins })).toBe("copy");
    expect(deckIs({ deck: "a", chosen: "b", timeline, twins: () => [] })).toBe("wrong");
    expect(deckIs({ deck: "a", chosen: "a", timeline, twins })).toBe("right");
  });

  it("reports each lecture and the total", () => {
    const r = { id: "os", deck: "a/CPU.pptx", chosen: "a/CPU.pptx", deckIs: "right", seconds: 600, moments: 10, onSlide: 8, right: 6, near: 7, dropped: 1, asides: 2, keptOff: 1 };
    const results = [r, { ...r, id: "fds", chosen: "a/Full.pptx", deckIs: "copy" }, { ...r, id: "dsa", chosen: "a/Other.pptx", deckIs: "wrong", right: 0, near: 0 }];
    const md = report({ results, date: "4 Nov 2026", floor: 0.85, whisper: "w", model: "m" });
    expect(md).toContain("| os | the right one | 8 | 75% | 88% | 13% | 1 of 2 |");
    expect(md).toContain("| fds | a copy of it: Full.pptx | 8 | 75% | 88% | 13% | 1 of 2 |");
    expect(md).toContain("| dsa | Other.pptx (wrong) | 8 | 0% | 0% | 13% | 1 of 2 |");
    expect(md).toContain("| All | 2 of 3 right or a copy | 24 | 50% | 58% | 13% | 3 of 6 |");
  });
});
