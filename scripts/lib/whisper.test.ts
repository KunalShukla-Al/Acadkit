import { describe, expect, it } from "vitest";
import { segmentsOf, whisperReady } from "./whisper.mjs";

describe("whisper.cpp's output", () => {
  it("becomes timed segments, without the noise markers", () => {
    const json = {
      transcription: [
        { offsets: { from: 0, to: 1600 }, text: " Today we look at page replacement." },
        { offsets: { from: 1600, to: 2100 }, text: " [MUSIC]" },
        { offsets: { from: 2100, to: 7200 }, text: " When a page fault occurs," },
        { offsets: { from: 7200, to: 7300 }, text: " " },
      ],
    };
    expect(segmentsOf(json)).toEqual([
      { start: 0, end: 1.6, text: "Today we look at page replacement." },
      { start: 2.1, end: 7.2, text: "When a page fault occurs," },
    ]);
  });

  it("says what's missing before it tries", () => {
    expect(whisperReady("/no/such/model.bin").missing).toMatch(/^(whisper\.cpp \(brew install whisper-cpp\)|the model at \/no\/such\/model\.bin)$/);
  });
});
