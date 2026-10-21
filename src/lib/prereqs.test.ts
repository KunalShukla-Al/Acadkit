import { describe, expect, it } from "vitest";
import { prereqsFor, type PrereqsData } from "./prereqs";

const data: PrereqsData = {
  version: 1,
  links: [
    {
      course: "21CSE251T",
      unit: 2,
      needs: [
        { course: "21MAB201T", unit: 4, title: "TBVP", why: "Fourier", source: "curated" },
        { course: "21CSC201J", unit: 1, title: "DSA", why: "close in meaning", source: "auto", score: 0.87 },
      ],
    },
    {
      course: "21CSE251T",
      unit: 1,
      needs: [
        { course: "21CSC201J", unit: 1, title: "DSA", why: "a", source: "auto" },
        { course: "21CSC202J", unit: 1, title: "OS", why: "b", source: "auto" },
        { course: "21CSS202T", unit: 1, title: "FDS", why: "c", source: "auto" },
      ],
    },
    { course: "21MAB301T", unit: 1, needs: [{ course: "21MAB101T", unit: null, title: "Calculus", why: "integration", source: "curated" }] },
  ],
};

describe("prereqsFor", () => {
  it("keeps one course's units in order, hand-checked links over found ones", () => {
    const out = prereqsFor(data, "21CSE251T");
    expect(out.map((l) => l.unit)).toEqual([1, 2]);
    expect(out[1].needs.map((n) => n.course)).toEqual(["21MAB201T"]);
  });
  it("caps links found by meaning alone at two", () => {
    expect(prereqsFor(data, "21CSE251T")[0].needs).toHaveLength(2);
  });
  it("is empty without data", () => {
    expect(prereqsFor(null, "21CSE251T")).toEqual([]);
  });
});
