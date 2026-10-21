import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { alignLecture, alignMoments, centerOn, deckSlides, meanOf, momentsOf, slideDecks } from "./lecture-align.mjs";
import { renditionPath } from "./renditions.mjs";

// Unit vectors on three axes, mixed: like(a, b) leans towards axis a by b.
const axis = (i: number) => [0, 1, 2].map((k) => (k === i ? 1 : 0));
const like = (i: number, by: number) => {
  const v = axis(i).map((x) => x * by + (1 - by) / 3);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const slides = (...axes: number[]) => axes.map((a, i) => ({ page: i + 1, vector: axis(a) }));

let root: string;
beforeEach(async () => (root = await mkdtemp(path.join(tmpdir(), "align-"))));
afterEach(() => rm(root, { recursive: true, force: true }));

describe("moments", () => {
  it("are about a minute of segments, cut between them", () => {
    const seg = (start: number, end: number, text: string) => ({ start, end, text });
    expect(momentsOf([seg(0, 25, "a"), seg(25, 55, "b"), seg(55, 80, "c"), seg(80, 100, "d")])).toEqual([
      { start: 0, end: 55, text: "a b" },
      { start: 55, end: 100, text: "c d" },
    ]);
    expect(momentsOf([])).toEqual([]);
  });
});

describe("lining moments up with slides", () => {
  it("follows the deck forward, even past a closer slide behind", () => {
    // The third moment is most like slide 1, but the lecture is past it: slide 3 is the one ahead.
    const deck = [{ page: 1, vector: axis(0) }, { page: 2, vector: axis(1) }, { page: 3, vector: like(0, 0.8) }];
    const { aligned } = alignMoments([axis(0), axis(1), axis(0)], deck, 0.5);
    expect(aligned.map((a: { page: number | null }) => a.page)).toEqual([1, 2, 3]);
  });

  it("gives a moment off the slides none, without losing the place", () => {
    const off = [1, 1, 1].map((x) => x / Math.sqrt(3));
    const { aligned } = alignMoments([like(0, 1), off, like(1, 1)], slides(0, 1, 2), 0.9);
    expect(aligned).toEqual([{ page: 1, similarity: 1 }, { page: null, similarity: null }, { page: 2, similarity: 1 }]);
  });

  it("scores nothing without slides or moments", () => {
    expect(alignMoments([], slides(0), 0.5).score).toBe(0);
    expect(alignMoments([axis(0)], [], 0.5)).toEqual({ score: 0, aligned: [{ page: null, similarity: null }] });
  });
});

describe("a course's decks", () => {
  it("are its slides under 02_Notes, not its notes or hidden files", async () => {
    const notes = path.join(root, "Operating_Systems", "02_Notes");
    await mkdir(path.join(notes, "Unit_3"), { recursive: true });
    for (const f of ["Unit_3/CPU_Scheduling.pptx", "Unit_3/Old.ppt", "Unit_3/Notes.pdf", "Unit_3/Lecture_Slides_B.pdf", "_Hidden_Slides.pdf", "Unit_3/board.jpg"]) await writeFile(path.join(notes, f), "x");
    expect(await slideDecks(root, "Operating_Systems")).toEqual([
      "Operating_Systems/02_Notes/Unit_3/CPU_Scheduling.pptx",
      "Operating_Systems/02_Notes/Unit_3/Lecture_Slides_B.pdf",
      "Operating_Systems/02_Notes/Unit_3/Old.ppt",
    ]);
  });

  it("read from the viewer's PDF of a deck when there is one, skipping slides without text, and cached", async () => {
    const deck = path.join(root, "deck.pptx");
    await writeFile(deck, "deck");
    const renditions = path.join(root, "renditions");
    const { createHash } = await import("node:crypto");
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

describe("a lecture", () => {
  it("follows the deck its moments match best", async () => {
    const notes = path.join(root, "OS", "02_Notes");
    await mkdir(notes, { recursive: true });
    await writeFile(path.join(notes, "A_Slides.pdf"), "a");
    await writeFile(path.join(notes, "B_Slides.pdf"), "b");
    const text = "x".repeat(50);
    const read = async (full: string) => ({ pages: path.basename(full).startsWith("A") ? [text, text] : [text, text, text] });
    // Deck A's slides lie on axis 2, B's on 0, 1 and 2; the moments go 0, 1.
    const embed = async (texts: string[]) => texts.map((t, i) => (t === text ? axis(texts.length === 2 ? 2 : i) : axis(i)));
    const segments = [{ start: 0, end: 50, text: "fcfs" }, { start: 70, end: 130, text: "rr" }];
    const out = await alignLecture({ dir: root, folder: "OS", segments, read, embed, cacheDir: path.join(root, "vectors"), floor: 0.5 });
    expect(out.deck).toBe("OS/02_Notes/B_Slides.pdf");
    expect(out.moments).toEqual([
      { start: 0, end: 50, text: "fcfs", page: 1, similarity: 1 },
      { start: 70, end: 130, text: "rr", page: 2, similarity: 1 },
    ]);
  });
});

describe("centering", () => {
  it("takes what the course's slides share off a vector", () => {
    expect(meanOf([[1, 0], [0, 1]])).toEqual([0.5, 0.5]);
    const [x, y] = centerOn([0.5, 0.5])([1, 0]);
    expect([x.toFixed(3), y.toFixed(3)]).toEqual(["0.707", "-0.707"]);
  });

  it("leaves talk that is like every slide alike on none, however close it is", async () => {
    const notes = path.join(root, "OS", "02_Notes");
    await mkdir(notes, { recursive: true });
    await writeFile(path.join(notes, "A_Slides.pdf"), "a");
    const text = (i: number) => `slide ${i} ${"x".repeat(50)}`;
    const read = async () => ({ pages: [text(1), text(2), text(3)] });
    // Three slides on their own axes plus a shared lean; the aside is the shared lean itself.
    const lean = (i: number) => [0, 1, 2, 3].map((k) => (k === 3 ? 2 : k === i ? 1 : 0));
    const unitOf = (v: number[]) => v.map((x) => x / Math.hypot(...v));
    const embed = async (texts: string[]) => texts.map((t) => unitOf(t.startsWith("slide") ? lean(Number(t[6]) - 1) : t === "aside" ? [0.34, 0.33, 0.33, 2] : lean(0)));
    const segments = [{ start: 0, end: 50, text: "about slide one" }, { start: 70, end: 130, text: "aside" }];
    const raw = unitOf([0.34, 0.33, 0.33, 2]).reduce((s, x, i) => s + x * unitOf(lean(0))[i], 0);
    expect(raw).toBeGreaterThan(0.9);
    const out = await alignLecture({ dir: root, folder: "OS", segments, read, embed, cacheDir: path.join(root, "vectors"), floor: 0.3 });
    expect(out.moments.map((m: { page: number | null }) => m.page)).toEqual([1, null]);
  });
});
