import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { derivedFingerprint, lastDerived, recordDerived } from "./derived.mjs";

const files = [
  { path: "OS/notes.pdf", key: "0404/blobs/a.pdf", subject_code: "21CSC202J", unit: 2, kind: "notes" },
  { path: "OS/07_PYQs/2025.pdf", key: "0404/blobs/b.pdf", subject_code: "21CSC202J", unit: null, kind: "pyq" },
];
const base = { pin: "0404", files, syllabi: '{"courses":{}}', code: ["export const A = 1;"] };

describe("derivedFingerprint", () => {
  it("is the same for the same inputs, whatever order the files come in", () => {
    expect(derivedFingerprint(base)).toBe(derivedFingerprint({ ...base, files: [...files].reverse() }));
  });

  it("changes with a file's content, tags or path, the syllabi, the code and the switches", () => {
    const fp = derivedFingerprint(base);
    const changed = [
      { ...base, files: [{ ...files[0], key: "0404/blobs/c.pdf" }, files[1]] },
      { ...base, files: [{ ...files[0], unit: 3 }, files[1]] },
      { ...base, files: [{ ...files[0], path: "OS/notes2.pdf" }, files[1]] },
      { ...base, files: [files[0]] },
      { ...base, syllabi: '{"courses":{"x":{}}}' },
      { ...base, code: ["export const A = 2;"] },
      { ...base, switches: { STUDY_PAPERBANK_QUESTIONS: "[]" } },
    ];
    for (const inputs of changed) expect(derivedFingerprint(inputs)).not.toBe(fp);
  });

  it("is remembered between runs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "derived-"));
    const file = path.join(dir, "deep", "derived.json");
    expect(await lastDerived(file)).toBeNull();
    await recordDerived("abc", file);
    expect(await lastDerived(file)).toBe("abc");
    await rm(dir, { recursive: true, force: true });
  });
});
