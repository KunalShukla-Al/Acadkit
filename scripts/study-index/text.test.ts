import { describe, expect, it } from "vitest";
import { needsSparseCheck } from "./text.mjs";

describe("needsSparseCheck", () => {
  const watermark = "lOMoARcPSD|29703923 Downloaded by someone (x@y.com)";
  it("reads a PDF again when a page's text layer is only a watermark", () => {
    expect(needsSparseCheck({ pages: [watermark, "x".repeat(500)], ocr: [false, false] }, "pdf")).toBe(true);
  });
  it("leaves alone pages already read with OCR, full text layers, other formats and re-checked files", () => {
    expect(needsSparseCheck({ pages: [watermark], ocr: [true] }, "pdf")).toBe(false);
    expect(needsSparseCheck({ pages: ["x".repeat(500)], ocr: [false] }, "pdf")).toBe(false);
    expect(needsSparseCheck({ pages: [watermark], ocr: [false] }, "pptx")).toBe(false);
    expect(needsSparseCheck({ pages: [watermark], ocr: [false], sparseChecked: true }, "pdf")).toBe(false);
  });
});
