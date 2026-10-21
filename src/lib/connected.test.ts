import { describe, expect, it } from "vitest";
import { chipLabel, courseOfCode, courseOfPath, hrefOf, itemOf, linksFor, momentId, pageIds, questionFor, questionId, type LinksPart } from "@/lib/connected";

describe("item ids", () => {
  it("say what they point at", () => {
    expect(itemOf("slide:Operating_Systems/02_Notes/Unit_3/CPU#1.pptx#24")).toEqual({ kind: "slide", path: "Operating_Systems/02_Notes/Unit_3/CPU#1.pptx", page: 24 });
    expect(itemOf("page:OS/notes.pdf#3")).toEqual({ kind: "page", path: "OS/notes.pdf", page: 3 });
    expect(itemOf("photo:OS/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg")).toEqual({ kind: "photo", path: "OS/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg" });
    expect(itemOf(questionId("os-es-2025-12", "B21a"))).toEqual({ kind: "question", paper: "os-es-2025-12", slot: "B21a" });
    expect(itemOf(momentId("20261103 100500-A.m4a", 4))).toEqual({ kind: "moment", memo: "20261103 100500-A.m4a", idx: 4 });
    expect(itemOf("board:x")).toBeNull();
    expect(itemOf("page:OS/notes.pdf")).toBeNull();
  });

  it("are made the way the Mac makes them", () => {
    expect(pageIds("OS/x.pdf", 2)).toEqual(["page:OS/x.pdf#2", "slide:OS/x.pdf#2"]);
    expect(courseOfPath("Operating_Systems/02_Notes/x.pdf")).toBe("Operating_Systems");
  });
});

const PART: LinksPart = {
  course: "Operating_Systems",
  links: {
    "page:OS/notes.pdf#3": [{ id: "question:os-es-2025-12#B21", kind: "question", why: "meaning", score: 0.31 }],
    "slide:OS/notes.pdf#3": [
      { id: "moment:a.m4a#4", kind: "moment", why: "time" },
      { id: "page:OS/other.pdf#9", kind: "page", why: "meaning", score: 0.42 },
      { id: "question:os-es-2025-12#B21", kind: "question", why: "meaning", score: 0.29 },
    ],
  },
  questions: { "question:os-es-2025-12#B21": { path: "OS/07_PYQs/es-2025-12.pdf", label: "End-sem Dec 2025 · B21", text: "Explain paging with a neat diagram and its advantages." } },
  moments: { "moment:a.m4a#4": { at: "2026-11-03T10:14" } },
};

describe("an item's links", () => {
  it("merge its ids, each once, by time first and then best first", () => {
    expect(linksFor(PART, pageIds("OS/notes.pdf", 3)).map((l) => l.id)).toEqual(["moment:a.m4a#4", "page:OS/other.pdf#9", "question:os-es-2025-12#B21"]);
    expect(linksFor(null, ["x"])).toEqual([]);
  });

  it("say what each is on its chip", () => {
    const [moment, page, question] = linksFor(PART, pageIds("OS/notes.pdf", 3));
    expect([chipLabel(moment, PART), chipLabel(page, PART), chipLabel(question, PART)]).toEqual(["Lecture 3 Nov, 10:14", "p. 9 · other", "End-sem Dec 2025 · B21"]);
    expect(chipLabel({ id: "slide:OS/02_Notes/Unit3_CPU_Scheduling_and_Deadlocks_Slides.pptx#24", kind: "slide", why: "time" }, PART)).toBe("Slide 24 · Unit3_CPU_Scheduling_and_…");
    expect(chipLabel({ id: "photo:OS/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg", kind: "photo", why: "time" }, PART)).toBe("Board photo, 3 Nov");
  });

  it("find a listed question by its paper and words", () => {
    expect(questionFor({ path: "OS/07_PYQs/es-2025-12.pdf", text: "Explain paging with neat diagram. List its advantages" }, PART)).toBe("question:os-es-2025-12#B21");
    expect(questionFor({ path: "OS/07_PYQs/es-2025-12.pdf", text: "Describe the banker's algorithm" }, PART)).toBeNull();
    expect(questionFor({ path: "OS/07_PYQs/other.pdf", text: "Explain paging with a neat diagram" }, PART)).toBeNull();
  });

  it("find a course's folder from its code, not its lab's", () => {
    const files = [{ path: "Operating_Systems_Lab/x.pdf", subject_code: "21CSC202J" }, { path: "Operating_Systems/y.pdf", subject_code: "21csc202j" }];
    expect(courseOfCode(files, "21CSC202J")).toBe("Operating_Systems");
    expect(courseOfCode(files, null)).toBeNull();
  });
});

describe("where a chip opens", () => {
  const lectures = new Map([["a.m4a", "lec-1"]]);
  const open = (id: string, kind: string) => hrefOf({ id, kind, why: "meaning" } as never, PART, lectures);

  it("opens each kind of item where it lives", () => {
    expect(open("slide:OS/deck.pptx#24", "slide")).toBe("/view?path=OS%2Fdeck.pptx&page=24");
    expect(open("photo:OS/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg", "photo")).toBe("/view?path=OS%2F02_Notes%2FClass_Photos%2F2026-11-03%2FIMG_1.jpg");
    expect(open("question:os-es-2025-12#B21", "question")).toBe("/view?path=OS%2F07_PYQs%2Fes-2025-12.pdf");
    expect(open("moment:a.m4a#4", "moment")).toBe("/lecture/lec-1?m=4");
  });

  it("opens nothing it can't find", () => {
    expect(open("moment:b.m4a#4", "moment")).toBeNull();
    expect(open("question:unknown#A1", "question")).toBeNull();
  });
});
