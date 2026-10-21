import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addAccepted, addToDataset, doubts, paperId, placePaper } from "./paper-dataset.mjs";

const q = (slot: string, number: number, topic: string | null = "paging") => ({ slot, part: slot[0], number, marks: 1, unit: 3, topic });
const full = Array.from({ length: 12 }, (_, i) => q(`A${i + 1}`, i + 1));
const META = { kind: "end", test: "END", date: "2025-12" };

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "dataset-"));
  await writeFile(path.join(dir, "papers.tsv"), "subject\tpaper\tkind\ttest\tsession\tdate\tset\tscope\tchoice\tfile\tnote\nOS\tos-es-2025-12\tend\tEND\tEND 2025-12\t2025-12\t-\tmain\tC26-27:1\tOperating_Systems/07_PYQs/old.pdf\t\n");
  await writeFile(path.join(dir, "questions.tsv"), "subject\tpaper\tslot\tmarks\ttopic\ttype\ttext\n");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("whether a reading needs asking about", () => {
  it("trusts a paper with its numbers in a row, its topics and a date", () => {
    expect(doubts(full, META)).toEqual([]);
  });

  it("says what looks wrong", () => {
    const gappy = full.filter((x) => ![4, 5].includes(x.number));
    expect(doubts(gappy, META)).toEqual(["no question 4, 5"]);
    expect(doubts(full.slice(0, 6), { ...META, date: null })).toEqual(["only 6 questions read", "no date on it"]);
    expect(doubts(full.map((x, i) => (i < 4 ? { ...x, topic: null } : x)), META)).toEqual(["4 without a topic"]);
  });
});

describe("the dataset", () => {
  it("names a paper as I do, and never twice", () => {
    expect(paperId("OS", META, new Set())).toBe("os-es-2025-12");
    expect(paperId("OS", META, new Set(["os-es-2025-12"]))).toBe("os-es-2025-12-2");
    expect(paperId("DSA", { kind: "ct", test: "CT-1", date: "2026-09" }, new Set())).toBe("dsa-ct1-2026-09");
  });

  it("adds a paper and its questions, once per file", async () => {
    const file = "Operating_Systems/07_PYQs/IMG_2042.jpg";
    expect(await addToDataset({ datasetDir: dir, subject: "OS", meta: META, file, questions: full })).toBe("os-es-2025-12-2");
    expect(await addToDataset({ datasetDir: dir, subject: "OS", meta: META, file, questions: full })).toBeNull();
    const papers = (await readFile(path.join(dir, "papers.tsv"), "utf8")).trim().split("\n");
    expect(papers.at(-1)).toBe(`OS\tos-es-2025-12-2\tend\tEND\tEND 2025-12\t2025-12\t-\tmain\t-\t${file}\tread by Autopilot`);
    const questions = (await readFile(path.join(dir, "questions.tsv"), "utf8")).trim().split("\n");
    expect(questions).toHaveLength(13);
    expect(questions[1]).toBe("OS\tos-es-2025-12-2\tA1\t1\tpaging\t\t");
  });
});

describe("placing a filed paper", () => {
  const sb = (accepted: unknown[] = []) => {
    const asked: Record<string, unknown>[] = [];
    const chain = { eq: () => chain, then: (ok: (r: unknown) => void) => ok({ data: accepted, error: null }) };
    return { asked, from: () => ({ upsert: async (row: Record<string, unknown>) => (asked.push(row), { error: null }), select: () => chain }) };
  };
  const reading = (questions: ReturnType<typeof q>[]) => ({ subject: "OS", subjectCode: "21CSC202J", meta: META, questions, sha: "abc" });

  it("adds a trusted reading at once", async () => {
    const supabase = sb();
    const said = await placePaper({ supabase, pin: "1234", datasetDir: dir, reading: reading(full), file: "Operating_Systems/07_PYQs/new.pdf", sha: "abc" });
    expect(said).toBe("Added Operating_Systems/07_PYQs/new.pdf to the past papers as os-es-2025-12-2, 12 questions.");
    expect(supabase.asked).toEqual([]);
  });

  it("asks on Today about a doubtful one, and adds it once I say yes", async () => {
    const supabase = sb();
    const said = await placePaper({ supabase, pin: "1234", datasetDir: dir, reading: reading(full.slice(0, 6)), file: "Operating_Systems/07_PYQs/new.pdf", sha: "abc" });
    expect(said).toBe("Asked before adding Operating_Systems/07_PYQs/new.pdf to the past papers: only 6 questions read.");
    expect(supabase.asked[0]).toMatchObject({ device_id: "1234", key: "paper:abc", kind: "paper", status: "pending", evidence: "only 6 questions read" });

    const added = await addAccepted({ supabase: sb([{ id: "s1", payload: supabase.asked[0].payload }]), pin: "1234", datasetDir: dir, log: () => {} });
    expect(added).toEqual(["os-es-2025-12-2"]);
  });
});
