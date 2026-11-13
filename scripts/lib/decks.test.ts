import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { centerOn, deckSlides, isDeck, meanOf } from "./decks.mjs";
import { renditionPath } from "./renditions.mjs";

const axis = (i: number) => [0, 1, 2].map((k) => (k === i ? 1 : 0));

let root: string;
beforeEach(async () => (root = await mkdtemp(path.join(tmpdir(), "decks-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("a deck", () => {
  it("is a PowerPoint file, or a PDF named as slides", () => {
    expect(["Unit2.pptx", "old.ppt", "Unit3_Slides.pdf"].map(isDeck)).toEqual([true, true, true]);
    expect(["Unit3_Notes.pdf", "notes.docx"].map(isDeck)).toEqual([false, false]);
  });

  it("is read from the viewer's PDF of it when there is one, skipping slides without text, and cached", async () => {
    const deck = path.join(root, "deck.pptx");
    await writeFile(deck, "deck");
    const renditions = path.join(root, "renditions");
    const pdf = renditionPath(createHash("sha256").update("deck").digest("hex"), "pptx", renditions);
    await mkdir(renditions, { recursive: true });
    await writeFile(pdf, "pdf");
    const reads: string[] = [];
    const read = async (full: string, ext: string) => (reads.push(`${path.basename(full)}:${ext}`), { pages: ["Round Robin scheduling: each process gets a small time quantum", "Thanks!", "First-come, first-served: a FIFO queue of processes"] });
    let embedded = 0;
    const embed = async (texts: string[]) => ((embedded += texts.length), texts.map((_, i) => axis(i)));
    const opts = { read, embed, cacheDir: path.join(root, "vectors"), renditions };
    expect(await deckSlides(deck, opts)).toEqual([{ page: 1, vector: axis(0) }, { page: 3, vector: axis(1) }]);
    expect(await deckSlides(deck, opts)).toEqual([{ page: 1, vector: axis(0) }, { page: 3, vector: axis(1) }]);
    expect([reads, embedded]).toEqual([[`${path.basename(pdf)}:pdf`], 2]);
  });
});

describe("centering", () => {
  it("takes what the course's slides share off a vector", () => {
    expect(meanOf([[1, 0], [0, 1]])).toEqual([0.5, 0.5]);
    const [x, y] = centerOn([0.5, 0.5])([1, 0]);
    expect([x.toFixed(3), y.toFixed(3)]).toEqual(["0.707", "-0.707"]);
  });
});
