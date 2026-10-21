import { describe, expect, it } from "vitest";
import { freshReport, interval, judgedReport, sampleLinks } from "./links-judge.mjs";

const items = [
  ...["q1", "q2", "q3"].map((id) => ({ id, kind: "question" })),
  ...["s1", "s2", "s3"].map((id) => ({ id, kind: "slide" })),
  ...["p1", "p2"].map((id) => ({ id, kind: "page" })),
];
const meaning = (id: string, score: number) => ({ id, kind: "", why: "meaning", score });
const links = {
  q1: [meaning("s1", 0.5), meaning("p1", 0.4)],
  s1: [meaning("q1", 0.5), meaning("p2", 0.3)],
  q2: [meaning("s2", 0.45), { id: "s3", kind: "slide", why: "time" }],
  q3: [meaning("s3", 0.41)],
};

describe("drawing links to judge", () => {
  it("takes each pair once, by quota, the same each time, and only links by meaning", () => {
    const quotas = { "question|slide": 2, "page|question": 1, "page|slide": 1 };
    const a = sampleLinks(links, items, { total: 4, quotas });
    expect(a).toHaveLength(4);
    expect(a.filter((p: { pair: string }) => p.pair === "question|slide")).toHaveLength(2);
    expect(new Set(a.map((p: { from: string; to: string }) => `${p.from}-${p.to}`)).size).toBe(4);
    expect(sampleLinks(links, items, { total: 4, quotas })).toEqual(a);
    expect(a.some((p: { from: string; to: string }) => p.from === "q2" && p.to === "s3")).toBe(false);
  });

  it("leaves out pairs judged before", () => {
    const quotas = { "question|slide": 3, "page|question": 0, "page|slide": 0 };
    const fresh = sampleLinks(links, items, { total: 3, quotas, exclude: new Set(["q1\ts1"]) });
    expect(fresh.map((p: { from: string; to: string }) => `${p.from}-${p.to}`).sort()).toEqual(["q2-s2", "q3-s3"]);
  });
});

describe("the report", () => {
  it("gives a share's 95% interval", () => {
    expect(interval(65, 100)).toBe("55–74%");
    expect(interval(0, 0)).toBe("-");
  });

  it("says how many were right, overall, by pair and by score", () => {
    const judged = [
      { from: "q1", to: "s1", pair: "question|slide", score: 0.5, right: true },
      { from: "q1", to: "p1", pair: "page|question", score: 0.35, right: false },
    ];
    const md = judgedReport(judged, { date: "6 Nov 2026" });
    expect(md).toContain("| All | 2 | 1 | 50% |");
    expect(md).toContain("| Question and slide | 1 | 1 | 100% |");
    expect(md).toContain("| 0.30 to 0.40 | 1 | 0 | 0% |");
    expect(md).toContain("judged by\nClaude, the assistant that built this");
  });

  it("reports a fresh sample against the bar's own", () => {
    const md = freshReport([{ from: "q1", to: "s1", pair: "question|slide", score: 0.5, right: true }], { date: "21 Oct 2026", before: "82%" });
    expect(md.split("\n")[0]).toBe("## Everything connected: the links the app shows");
    expect(md).toContain("| All | 1 | 1 | 100% |");
    expect(md).toContain("100%, against 82% for the links over 0.40");
  });
});
