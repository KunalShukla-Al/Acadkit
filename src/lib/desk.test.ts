import { describe, expect, it } from "vitest";
import {
  answerCaveat,
  answerLabel,
  askPrompt,
  blankProgress,
  claudeUrl,
  countdown,
  coverage,
  filterFrom,
  filterItems,
  gradePick,
  progressMap,
  topicKey,
  topicsOf,
  upcomingTests,
  visibleCourses,
  windowsInMonth,
  type DeskIndexCourse,
  type DeskItem,
  type DeskProgress,
} from "@/lib/desk";

const item = (over: Partial<DeskItem>): DeskItem => ({
  key: "OS/p/A1",
  unit: 1,
  topic: "t1",
  topicName: "Topic one",
  kind: "end",
  paper: "End-sem May 2025",
  slot: "A1",
  part: "A",
  marks: 1,
  mcq: true,
  text: "What is a process?",
  options: ["a", "b", "c", "d"],
  answer: "B",
  note: null,
  file: null,
  page: null,
  date: null,
  repeats: 1,
  solution: null,
  ...over,
});

const row = (item_key: string, over: Partial<DeskProgress>): DeskProgress => ({ ...blankProgress(item_key), ...over });

const ITEMS = [
  item({ key: "OS/p/A1" }),
  item({ key: "OS/p/A2", unit: 2, topic: "t2", topicName: "Topic two", answer: null }),
  item({ key: "OS/c/B21", kind: "ct", part: "B", mcq: false, options: [], answer: null, text: "Explain paging", solution: { file: "x.pdf", page: 3, kind: "worked", from: null } }),
];

describe("the Desk's courses", () => {
  it("drop a course the day after its showUntil", () => {
    const courses = [{ key: "OS", showUntil: "2026-11-30" }, { key: "PS", showUntil: null }];
    expect(visibleCourses(courses, "2026-11-30").map((c) => c.key)).toEqual(["OS", "PS"]);
    expect(visibleCourses(courses, "2026-12-01").map((c) => c.key)).toEqual(["PS"]);
  });
});

describe("grading a pick", () => {
  it("is correct or wrong against a key, and unreviewed without one", () => {
    expect(gradePick(ITEMS[0], "B")).toBe("correct");
    expect(gradePick(ITEMS[0], "C")).toBe("wrong");
    expect(gradePick(ITEMS[1], "A")).toBe("unreviewed");
    // A letter past the options is never graded.
    expect(gradePick(item({ options: ["a", "b"] }), "D")).toBe("unreviewed");
  });
});

describe("practice filters", () => {
  it("read from the URL, ignoring what isn't a filter", () => {
    expect(filterFrom(new URLSearchParams("unit=2&kind=ct&part=B&status=wrong&q= paging "))).toEqual({
      unit: 2, topic: null, kind: "ct", part: "B", status: "wrong", query: "paging",
    });
    expect(filterFrom(new URLSearchParams("unit=x&kind=nope&part=Z&status=odd"))).toMatchObject({ unit: null, kind: null, part: null, status: "all" });
  });

  it("keep by unit, source, part, text and progress", () => {
    const progress = progressMap([row("OS/p/A1", { attempted_at: "2026-11-27T10:00:00Z", result: "wrong", flag: true })]);
    const keys = (q: string) => filterItems(ITEMS, filterFrom(new URLSearchParams(q)), progress).map((i) => i.key);
    expect(keys("")).toEqual(["OS/p/A1", "OS/p/A2", "OS/c/B21"]);
    expect(keys("unit=2")).toEqual(["OS/p/A2"]);
    expect(keys("kind=ct")).toEqual(["OS/c/B21"]);
    expect(keys("part=A")).toEqual(["OS/p/A1", "OS/p/A2"]);
    expect(keys("q=PAGING")).toEqual(["OS/c/B21"]);
    expect(keys("status=new")).toEqual(["OS/p/A2", "OS/c/B21"]);
    expect(keys("status=attempted")).toEqual(["OS/p/A1"]);
    expect(keys("status=wrong")).toEqual(["OS/p/A1"]);
    expect(keys("status=flagged")).toEqual(["OS/p/A1"]);
  });
});

describe("coverage", () => {
  it("counts attempts, right answers among graded ones, keys and worked answers", () => {
    const progress = progressMap([
      row("OS/p/A1", { attempted_at: "x", result: "correct" }),
      row("OS/p/A2", { attempted_at: "x", result: "unreviewed", flag: true }),
    ]);
    expect(coverage(ITEMS, progress)).toEqual({
      total: 3, attempted: 2, correct: 1, graded: 1, flagged: 1, mcqs: 2, keyed: 1, written: 1, solved: 1, related: 0,
    });
  });

  it("counts a repeat's answer as worked and a topic's as related", () => {
    const written = (key: string, kind: "repeat" | "similar" | "topic") =>
      item({ key, part: "B", mcq: false, options: [], answer: null, solution: { file: "x.pdf", page: 1, kind, from: "Nov 2025" } });
    const c = coverage([...ITEMS, written("OS/c/B22", "repeat"), written("OS/c/B23", "similar"), written("OS/c/B24", "topic")], new Map());
    expect([c.written, c.solved, c.related]).toEqual([4, 2, 2]);
  });
});

describe("answer links", () => {
  const sol = (kind: "worked" | "repeat" | "similar" | "topic") => ({ file: "x.pdf", page: 4, kind, from: kind === "topic" ? null : "End-sem Nov 2025" });

  it("say whose answer opens", () => {
    expect(answerLabel(sol("worked"))).toBe("Open the worked answer, page 4");
    expect(answerLabel(sol("repeat"))).toBe("Open the worked answer (End-sem Nov 2025), page 4");
    expect(answerLabel(sol("similar"))).toBe("Open the closest worked answer (End-sem Nov 2025), page 4");
    expect(answerLabel(sol("topic"))).toBe("Open the model answer for this topic, page 4");
  });

  it("warn only when the answer is borrowed", () => {
    expect(answerCaveat(sol("worked"))).toBeNull();
    expect(answerCaveat(sol("topic"))).toMatch(/isn't this question's own answer/);
  });
});

describe("topics", () => {
  it("list each once, by unit, with how many questions ask it", () => {
    expect(topicsOf([...ITEMS, item({ key: "OS/q/A9" })])).toEqual([
      { topic: "t1", name: "Topic one", unit: 1, count: 3 },
      { topic: "t2", name: "Topic two", unit: 2, count: 1 },
    ]);
    expect(topicKey("PS", 1, 2)).toBe("topic:PS:1.2");
  });
});

describe("tests and windows", () => {
  const course = (key: string, tests: DeskIndexCourse["tests"]): DeskIndexCourse => ({
    key, code: null, name: key, semester: null, showUntil: null, items: 0, keyed: 0, solved: 0, tests, file: "",
  });
  const t = (id: string, start: string | null, end: string | null, date: string | null = null) => ({
    id, name: id, units: [], start, end, date, weight: null, provisional: true,
  });

  it("list what's still ahead, soonest first and undated last", () => {
    const list = upcomingTests(
      [course("PS", [t("FT-I", "2027-01-25", "2027-02-03"), t("Old", "2026-10-01", "2026-10-02"), t("Lab", null, null)]), course("OS", [t("END", "2026-11-30", "2026-11-30", "2026-11-30")])],
      "2026-11-27"
    );
    expect(list.map((x) => `${x.course.key} ${x.test.id}`)).toEqual(["OS END", "PS FT-I", "PS Lab"]);
  });

  it("count days the way people say them", () => {
    expect(countdown("2026-11-27", "2026-11-27")).toBe("today");
    expect(countdown("2026-11-28", "2026-11-27")).toBe("tomorrow");
    expect(countdown("2026-11-30", "2026-11-27")).toBe("in 3 days");
    expect(countdown("2026-11-25", "2026-11-27")).toBe("2 days ago");
  });

  it("find the windows a month touches", () => {
    const w = [
      { key: "ft1", label: "FT-I", start: "2027-01-25", end: "2027-02-03", semester: null },
      { key: "ft2", label: "FT-II", start: "2027-02-22", end: "2027-03-02", semester: null },
    ];
    expect(windowsInMonth(w, "2027-02").map((x) => x.key)).toEqual(["ft1", "ft2"]);
    expect(windowsInMonth(w, "2027-03").map((x) => x.key)).toEqual(["ft2"]);
  });
});

describe("Ask Claude", () => {
  it("sends the question with what Claude needs to find it", () => {
    const p = askPrompt({ key: "OS", name: "Operating Systems", folder: "Operating_Systems" }, item({ file: "OS/p.pdf", page: 2 }), "");
    expect(p).toContain("Course: Operating Systems (OS), folder Operating_Systems");
    expect(p).toContain("Options: A. a | B. b | C. c | D. d");
    expect(p).toContain("Paper: OS/p.pdf, page 2");
    expect(p.endsWith("Write an exam-ready answer.")).toBe(true);
    expect(claudeUrl("a b&c")).toBe("https://claude.ai/new?q=a%20b%26c");
  });
});
