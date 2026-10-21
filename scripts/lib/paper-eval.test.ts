import { describe, expect, it } from "vitest";
import { pagesOf, readPlan, scorePaper, sum } from "./paper-eval.mjs";

const UNITS: Record<string, number> = { cpu_sched: 2, paging: 3, deadlock: 2 };
const unitOf = (t: string) => UNITS[t] ?? null;
const label = (slot: string, marks: number, topic: string | null) => ({ slot, marks, topic });
const read = (slot: string, marks: number, topic: string | null) => ({ slot, marks, topic, unit: topic ? unitOf(topic) : null });

describe("scoring a paper against its labels", () => {
  it("counts each field on the questions found, and what was read that wasn't labelled", () => {
    const labels = [label("A1", 1, "cpu_sched"), label("A2", 1, "paging"), label("B21a", 8, "deadlock"), label("C26", 15, "paging")];
    const reading = [
      read("A1", 1, "cpu_sched"), // all right
      read("A2", 2, "deadlock"), // found, wrong marks and topic and unit
      read("B21a", 8, "cpu_sched"), // found, right unit through a different topic
      read("A26", 15, "paging"), // C26 read as Part A: not found, wrong part
      read("C27", 15, null), // extra
    ];
    expect(scorePaper(labels, reading, unitOf)).toEqual({ labelled: 4, read: 5, found: 3, part: 3, marks: 2, unit: 2, topic: 1, extra: 2 });
  });

  it("adds papers up", () => {
    const a = { labelled: 4, read: 5, found: 3, part: 3, marks: 2, unit: 2, topic: 1, extra: 2 };
    expect(sum([a, a])).toEqual({ papers: 2, labelled: 8, read: 10, found: 6, part: 6, marks: 4, unit: 4, topic: 2, extra: 4 });
  });
});

describe("the report", () => {
  it("gives each field's accuracy, then by course and by kind", async () => {
    const { report } = await import("./paper-eval.mjs");
    const s = { labelled: 10, read: 11, found: 9, part: 10, marks: 9, unit: 8, topic: 6, extra: 2 };
    const md = report({ papers: 2, scores: [{ subject: "OS", kind: "end", score: s }, { subject: "DSA", kind: "ct", score: s }], failed: [], seconds: [80, 100], model: "qwen3-vl:8b-instruct", version: 1, date: "2 Nov 2026" });
    expect(md).toContain("on the 2 papers in");
    expect(md).toContain("| Number: the question is found | 18 | 20 | 90.0% |");
    expect(md).toContain("| Topic, of those found | 12 | 18 | 66.7% |");
    expect(md).toContain("| OS | 1 | 90.0% | 100.0% | 100.0% | 88.9% | 66.7% |");
    expect(md).toContain("| Cycle test | 1 |");
    expect(md).toContain("It read every paper.");
    expect(md).toContain("A paper took 100 s at the median");
  });
});

describe("the pages a paper is on, in a file of several", () => {
  it("reads a page, a range, a list and a pair from the note", () => {
    expect(pagesOf("page 16; Part B only (Part A not photographed)")).toEqual([16]);
    expect(pagesOf("18CSC201J, pages 6–9 of the file; 75 marks: 25 MCQs and 5 × 10")).toEqual([6, 7, 8, 9]);
    expect(pagesOf("pages 7 and 10; Part A not photographed")).toEqual([7, 10]);
    expect(pagesOf("")).toBeNull();
  });

  it("adds the pages a note files with it, and leaves out a second copy or another file's", () => {
    expect(pagesOf("pages 1, 3, 5, 6, plus the Unit V MCQ page 4")).toEqual([1, 3, 4, 5, 6]);
    expect(pagesOf("pages 8, 9, 11, 12; the MCQ page (13–14) is filed with this set")).toEqual([8, 9, 11, 12, 13, 14]);
    expect(pagesOf("pages 1–4 of the file (pages 9–12 are a second copy)")).toEqual([1, 2, 3, 4]);
    expect(pagesOf("18CSC201J, pages 9–12 of the GradeX file; the same paper is pages 2–5 of May_2019")).toEqual([9, 10, 11, 12]);
  });

  it("reads a file of one paper whole, and leaves out a shared one whose pages aren't given", () => {
    const plan = readPlan([
      { paper: "alone", file: "a.pdf", note: "" },
      { paper: "first", file: "b.pdf", note: "pages 1–2" },
      { paper: "second", file: "b.pdf", note: "Set B" },
    ]);
    expect(plan.get("alone")).toEqual({ pages: null });
    expect(plan.get("first")).toEqual({ pages: [1, 2] });
    expect(plan.get("second")?.skip).toMatch(/pages aren't given/);
  });
});
