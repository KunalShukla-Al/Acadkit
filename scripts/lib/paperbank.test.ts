import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pyqNote, questionText, readPaperbank } from "./paperbank.mjs";

describe("paperbank", () => {
  it("reads each folder's file, with paths as the manifest writes them", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pb-"));
    await mkdir(path.join(root, "_src"));
    await writeFile(
      path.join(root, "_src", "acadkit_paperbank.json"),
      JSON.stringify({
        files: { "AI/07_PYQs/End_Sem/May_2025.pdf": { status: "current", kind: "end_sem", read: { quality: "fair" } } },
        questions: [
          { file: "AI/07_PYQs/End_Sem/May_2025.pdf", kind: "end_sem", text: "Explain A*.", options: [] },
          { file: "AI/07_PYQs/CT/key.pdf", kind: "ct", text: "Answer key text", options: [] },
        ],
        prereqs: [{ course: "21CSC206T", unit: 2, needs: [] }],
      })
    );
    const pb = await readPaperbank([{ root, prefix: "SRM_Sem4/" }], { log: () => {} });
    expect(pb.files.get("SRM_Sem4/AI/07_PYQs/End_Sem/May_2025.pdf")).toMatchObject({ status: "current", quality: "fair" });
    expect([...pb.questions.keys()]).toEqual(["SRM_Sem4/AI/07_PYQs/End_Sem/May_2025.pdf"]);
    expect(pb.prereqs).toHaveLength(1);
  });

  it("is empty without a file", async () => {
    const pb = await readPaperbank([{ root: await mkdtemp(path.join(tmpdir(), "pb-")), prefix: "" }], { log: () => {} });
    expect(pb.files.size + pb.questions.size + pb.prereqs.length).toBe(0);
  });

  it("notes only what is unusual about a paper", () => {
    expect(pyqNote({ status: "current", quality: "good" })).toBeNull();
    expect(pyqNote({ status: "old", quality: "poor" })).toEqual({ status: "old", quality: "poor" });
  });

  it("writes MCQ options after the question", () => {
    expect(questionText({ text: "Var(X)?", options: ["1", "2", "", "4"] })).toBe("Var(X)? (A) 1 (B) 2 (C) 4");
  });
});
