import { describe, expect, it } from "vitest";
import { barFor, checkBar, linkByMeaning, linkByTime, mergeLinks, splitLinks, unitPairs } from "./links.mjs";

const unit = (v: number[]) => v.map((x) => x / Math.hypot(...v));
const item = (id: string, kind: string, vector: number[], course = "OS", u: number | null = null) => ({ id, kind, course, unit: u, vector: unit(vector) });
const ZERO = { OS: [0, 0, 0, 0], DSA: [0, 0, 0, 0] };

describe("links by meaning", () => {
  it("points each item at its course's nearest items of other kinds, over the bar", () => {
    const items = [
      item("q1", "question", [1, 0.1, 0, 0]),
      item("s1", "slide", [1, 0, 0, 0]),
      item("s2", "slide", [0.9, 0.3, 0, 0]),
      item("s3", "slide", [0.6, 0.8, 0, 0]),
      item("s4", "slide", [0, 0, 1, 0]),
      item("p1", "page", [1, 0.1, 0, 0]),
      item("q2", "question", [1, 0, 0, 0], "DSA"),
    ];
    const links = linkByMeaning(items, ZERO, { bars: { "question|slide": 0.5, "page|question": 0.5, "page|slide": 0.5 }, perKind: 2 });
    expect(links.q1.map((l: { id: string }) => l.id)).toEqual(["p1", "s1", "s2"]);
    // Slides don't link to slides, and nothing crosses courses.
    expect(links.s4).toBeUndefined();
    expect(links.q2).toBeUndefined();
  });

  it("centers on each course's mean before comparing", () => {
    // Both lean on the axis the course shares; centered, they point apart.
    const items = [item("q", "question", [1, 0, 3, 0]), item("s", "slide", [0, 1, 3, 0])];
    expect(linkByMeaning(items, ZERO, { bars: { "question|slide": 0.5 } }).q).toHaveLength(1);
    expect(linkByMeaning(items, { OS: unit([0.5, 0.5, 3, 0]) }, { bars: { "question|slide": 0.5 } }).q).toBeUndefined();
  });

  it("gives a pair without its own bar the highest checked one", () => {
    expect(barFor("slide", "question", { "question|slide": 0.3, "moment|slide": 0.2 })).toBe(0.3);
    expect(barFor("photo", "question", { "question|slide": 0.3, "moment|slide": 0.2 })).toBe(0.3);
    expect(barFor("moment", "page")).toBe(0.4);
  });
});

describe("checking a bar", () => {
  it("finds the lowest bar where enough of the links above it are right", () => {
    const pairs = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3].map((score, i) => ({ score, right: i !== 2 && i < 5 }));
    // Above 0.5: 4 of 5 right (80%); above 0.4: 4 of 6.
    expect(checkBar(pairs, { precision: 0.8, min: 3 })).toEqual({ bar: 0.5, precision: 0.8, pairs: 5 });
    expect(checkBar(pairs, { precision: 0.95, min: 3 })).toBeNull();
  });

  it("marks a question's pairs right when the units agree", () => {
    const items = [item("q", "question", [1, 0, 0, 0], "OS", 4), item("a", "page", [1, 0, 0, 0], "OS", 4), item("b", "slide", [0, 1, 0, 0], "OS", 3), item("c", "page", [1, 0, 0, 0], "OS", null)];
    expect(unitPairs(items, ZERO).map((p: { kind: string; right: boolean }) => [p.kind, p.right])).toEqual([["page", true], ["slide", false]]);
  });
});

describe("links by time", () => {
  const DECK = "OS/02_Notes/Unit_3/CPU.pptx";
  const slide = (page: number) => ({ id: `slide:${DECK}#${page}`, kind: "slide", course: "OS", ref: { path: DECK, page }, vector: [] });
  const moment = (idx: number, at: string, page: number | null, slot = { start: "10:00", end: "10:50" }) => ({
    id: `moment:a.m4a#${idx}`, kind: "moment", course: "OS", at, slot, vector: [], ref: { memo: "a.m4a", idx, ...(page ? { deck: DECK, page } : {}) },
  });
  const photo = (name: string, at: string, course = "OS") => ({ id: `photo:${name}`, kind: "photo", course, at, ref: { path: name }, vector: [] });
  const items = [
    slide(23), slide(24),
    moment(0, "2026-11-03T10:05", 23), moment(1, "2026-11-03T10:06", null), moment(2, "2026-11-03T10:07", 24),
    // In class but before the recording began; after class; another course; another day.
    photo("early.jpg", "2026-11-03T10:01"), photo("board.jpg", "2026-11-03T10:07"), photo("late.jpg", "2026-11-03T11:00"),
    photo("dsa.jpg", "2026-11-03T10:07", "DSA"), photo("tomorrow.jpg", "2026-11-04T10:07"),
  ];

  it("ties a moment to the slide on screen then", () => {
    const links = linkByTime(items);
    expect(links["moment:a.m4a#0"]).toEqual([{ id: `slide:${DECK}#23`, kind: "slide", why: "time" }, { id: "photo:early.jpg", kind: "photo", why: "time" }]);
    expect(links["moment:a.m4a#1"]).toBeUndefined();
    expect(links[`slide:${DECK}#24`].map((l: { id: string }) => l.id)).toEqual(["moment:a.m4a#2", "photo:board.jpg"]);
  });

  it("ties a board photo to its class's nearest moment, and that moment's slide", () => {
    const links = linkByTime(items);
    expect(links["photo:board.jpg"].map((l: { id: string }) => l.id)).toEqual(["moment:a.m4a#2", `slide:${DECK}#24`]);
    // Inside the timetable's window, before the recording: the first moment.
    expect(links["photo:early.jpg"].map((l: { id: string }) => l.id)).toEqual(["moment:a.m4a#0", `slide:${DECK}#23`]);
    for (const p of ["late.jpg", "dsa.jpg", "tomorrow.jpg"]) expect(links[`photo:${p}`]).toBeUndefined();
  });

  it("uses the recording's span when the lecture matched no class", () => {
    const loose = items.map((i) => (i.kind === "moment" ? { ...i, slot: undefined } : i));
    const links = linkByTime(loose);
    expect(links["photo:early.jpg"]).toBeUndefined();
    expect(links["photo:board.jpg"].map((l: { id: string }) => l.id)).toEqual(["moment:a.m4a#2", `slide:${DECK}#24`]);
  });

  it("merges with links by meaning, time first and each item once", () => {
    const merged = mergeLinks({ a: [{ id: "s", kind: "slide", why: "time" }] }, { a: [{ id: "s", kind: "slide", why: "meaning", score: 0.4 }, { id: "p", kind: "page", why: "meaning", score: 0.3 }] });
    expect(merged.a.map((l: { id: string; why: string }) => `${l.id}:${l.why}`)).toEqual(["s:time", "p:meaning"]);
  });
});

describe("links for the app", () => {
  it("come as an index and a part per course, named by content, without vectors", () => {
    const question = { ...item("q", "question", [1, 0, 0, 0], "OS"), ref: { paper: "os-es-2025-12", slot: "B21", path: "OS/07_PYQs/es.pdf", label: "End-sem Dec 2025 · B21", text: "Explain paging." } };
    const items = [question, item("s", "slide", [1, 0, 0, 0], "OS"), item("d", "page", [1, 0, 0, 0], "DSA")];
    const links = { q: [{ id: "s", kind: "slide", why: "meaning", score: 0.4567 }], s: [{ id: "q", kind: "question", why: "time" }], d: [] };
    const { index, parts } = splitLinks(links, items, 42);
    expect(index).toEqual({
      version: 1,
      generatedAt: 42,
      courses: [{ course: "DSA", items: 1, file: parts[0].name }, { course: "OS", items: 2, file: parts[1].name }],
    });
    expect(parts[1].name).toMatch(/^links\/OS-[0-9a-f]{12}\.json$/);
    expect(JSON.parse(parts[1].json)).toEqual({
      course: "OS",
      links: { q: [{ id: "s", kind: "slide", why: "meaning", score: 0.46 }], s: [{ id: "q", kind: "question", why: "time" }] },
      questions: { q: { path: "OS/07_PYQs/es.pdf", label: "End-sem Dec 2025 · B21", text: "Explain paging." } },
      moments: {},
    });
    // The same links make the same part, so the app's copy stays good.
    expect(splitLinks(links, items, 43).parts[1].name).toBe(parts[1].name);
  });
});
