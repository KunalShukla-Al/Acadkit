import { describe, expect, it } from "vitest";
import { paperPrompt, readPaper, slotOf } from "./paper-reader.mjs";

const TOPICS = [
  { topic: "cpu_sched", unit: 2, name: "CPU scheduling" },
  { topic: "paging", unit: 3, name: "Paging" },
];

describe("reading a question number", () => {
  it("tidies how a model writes one, and refuses what isn't one", () => {
    expect(["A1", "a 12", "B 21 (a)", "b21A", "C26a.2", "C27"].map(slotOf)).toEqual(["A1", "A12", "B21a", "B21a", "C26a.2", "C27"]);
    expect(["B21c", "A", "26", "Part A"].map(slotOf)).toEqual([null, null, null, null]);
    // A run the model counted on past the page: SRM papers stop at 32.
    expect(["C32", "A33", "A100", "A0"].map(slotOf)).toEqual(["C32", null, null, null]);
  });
});

describe("the reader's question", () => {
  it("names the page, the topics with their units, and where the last page ended", () => {
    const prompt = paperPrompt({ course: "Operating Systems (OS)", page: 3, pages: 4, topics: TOPICS, text: "", after: "B25b" });
    expect(prompt).toContain("This is page 3 of 4 of an exam paper for Operating Systems (OS), from SRM.");
    expect(prompt).toContain("ended at question B25b; this page carries on from there.");
    expect(prompt).not.toMatch(/B25b, worth/);
    expect(prompt).toContain("  - paging: Paging (unit 3)");
    expect(paperPrompt({ course: "OS", page: 1, pages: 4, topics: TOPICS, text: "" })).not.toContain("ended at");
  });
});

describe("reading a paper", () => {
  it("reads a page as text when it has a text layer and as a picture when not, and joins the pages in order", async () => {
    const pages = async () => [
      { image: "p1", text: "" },
      { image: "p2", text: "x".repeat(400) },
    ];
    const sent: { images: string[]; prompt: string }[] = [];
    const answers = [
      { questions: [{ slot: "A2", marks: 1, topic: "paging" }, { slot: "A1", marks: 1, topic: "cpu_sched" }] },
      // Page 2 repeats A2 (a question over the break), adds a sub-question, and one junk number.
      { questions: [{ slot: "A2", marks: 4, topic: null }, { slot: "c 26 (a)", marks: 15, topic: "cpu_sched" }, { slot: "B21c", marks: 8, topic: null }] },
    ];
    const ask = async (q: { images: string[]; prompt: string }) => (sent.push(q), answers.shift()!);
    const read = await readPaper({ full: "paper.pdf", course: "OS", topics: TOPICS, ask, pages });

    expect(sent.map((q) => q.images)).toEqual([["p1"], []]);
    expect(sent[1].prompt).toContain("ended at question A2");
    expect(sent[1].prompt).toContain(`The page's text: ${"x".repeat(400)}`);
    expect(read).toEqual([
      { slot: "A1", part: "A", number: 1, marks: 1, unit: 2, topic: "cpu_sched" },
      { slot: "A2", part: "A", number: 2, marks: 1, unit: 3, topic: "paging" },
      { slot: "C26a", part: "C", number: 26, marks: 15, unit: 2, topic: "cpu_sched" },
    ]);
  });
});
