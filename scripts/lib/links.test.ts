import { describe, expect, it } from "vitest";
import { barFor, checkBar, linkByMeaning, splitLinks, unitPairs } from "./links.mjs";

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
    expect(barFor("slide", "question", { "question|slide": 0.3, "page|slide": 0.2 })).toBe(0.3);
    expect(barFor("photo", "question", { "question|slide": 0.3, "page|slide": 0.2 })).toBe(0.3);
    expect(barFor("photo", "page")).toBe(0.4);
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
    });
    // The same links make the same part, so the app's copy stays good.
    expect(splitLinks(links, items, 43).parts[1].name).toBe(parts[1].name);
  });
});
