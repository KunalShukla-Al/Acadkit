import { describe, expect, it } from "vitest";
import {
  codeLanguage,
  columnName,
  NOTE_SANDBOX,
  noteDocument,
  parseDelimited,
  readTextHead,
  shownFile,
  splitHighlighted,
  trimSheet,
  viewerHref,
  viewerKind,
} from "@/lib/viewer";

describe("viewerKind", () => {
  it("routes each format the viewer reads to its renderer", () => {
    expect(viewerKind("OS/Unit_1/Notes.PDF")).toBe("pdf");
    expect(viewerKind("a/Handout.docx")).toBe("docx");
    expect(viewerKind("lab/ex1.c")).toBe("code");
    expect(viewerKind("lab/ex1.cpp")).toBe("code");
    expect(viewerKind("lab/Main.java")).toBe("code");
    expect(viewerKind("lab/q.py")).toBe("code");
    expect(viewerKind("a/readme.md")).toBe("text");
    expect(viewerKind("a/Marks.xlsx")).toBe("sheet");
    expect(viewerKind("a/export.csv")).toBe("sheet");
    expect(viewerKind("a/board.JPG")).toBe("image");
  });

  it("marks slides and the binary Office formats as needing the Mac's conversion", () => {
    expect(viewerKind("a/Slides.pptx")).toBe("convert");
    expect(viewerKind("a/old.doc")).toBe("convert");
    expect(viewerKind("a/old.ppt")).toBe("convert");
    expect(viewerKind("a/old.xls")).toBe("convert");
  });

  it("offers only the download for anything else", () => {
    expect(viewerKind("a/archive.zip")).toBe("none");
    expect(viewerKind("a/noext")).toBe("none");
  });
});

describe("codeLanguage", () => {
  it("names the highlighter's language", () => {
    expect(codeLanguage("x.h")).toBe("c");
    expect(codeLanguage("x.hpp")).toBe("cpp");
    expect(codeLanguage("x.py")).toBe("python");
    expect(codeLanguage("x.txt")).toBeNull();
  });
});

describe("viewerHref", () => {
  it("encodes the path and adds a page only when given", () => {
    expect(viewerHref("OS & DS/Unit 1.pdf")).toBe("/view?path=OS+%26+DS%2FUnit+1.pdf");
    expect(viewerHref("a.pdf", 4)).toBe("/view?path=a.pdf&page=4");
    expect(viewerHref("a.pdf", null)).toBe("/view?path=a.pdf");
  });
});

describe("splitHighlighted", () => {
  it("re-opens a span a line break cuts through", () => {
    const html = 'int x; <span class="c">/* one\ntwo */</span>\nreturn;';
    expect(splitHighlighted(html)).toEqual([
      'int x; <span class="c">/* one</span>',
      '<span class="c">two */</span>',
      "return;",
    ]);
  });

  it("handles nested spans", () => {
    const html = '<span class="s">"a<span class="e">\\n\nb</span>"</span>';
    expect(splitHighlighted(html)).toEqual([
      '<span class="s">"a<span class="e">\\n</span></span>',
      '<span class="s"><span class="e">b</span>"</span>',
    ]);
  });
});

describe("parseDelimited", () => {
  it("reads quoted separators, newlines and doubled quotes", () => {
    const csv = 'Name,Note\r\n"Kunal, K","said ""hi""\nthen left"\nA,\n\n';
    expect(parseDelimited(csv)).toEqual([
      ["Name", "Note"],
      ["Kunal, K", 'said "hi"\nthen left'],
      ["A", ""],
    ]);
  });
  it("reads tabs for TSV", () => {
    expect(parseDelimited("a\tb\n1\t2", "\t")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("columnName", () => {
  it("counts like a spreadsheet", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(["A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
  });
});

describe("trimSheet", () => {
  it("drops blank trailing rows and columns and pads short rows", () => {
    expect(trimSheet<string | number>([["a", null, ""], ["b", 2], [null, null, null], []])).toEqual([
      ["a", null],
      ["b", 2],
    ]);
    expect(trimSheet([[null], []])).toEqual([]);
  });
});

describe("shownFile", () => {
  const f = (path: string, preview?: { key: string; ext: string }) => ({ path, key: `k/${path}`, preview });
  it("shows an Office file as the PDF the Mac made of it", () => {
    expect(shownFile(f("OS/slides.pptx", { key: "p.pdf", ext: "pdf" }))).toEqual({ kind: "pdf", key: "p.pdf", ext: "pdf" });
    expect(shownFile(f("OS/notes.docx", { key: "n.pdf", ext: "pdf" }))).toEqual({ kind: "pdf", key: "n.pdf", ext: "pdf" });
    expect(shownFile(f("OS/old.xls", { key: "m.xlsx", ext: "xlsx" }))).toEqual({ kind: "sheet", key: "m.xlsx", ext: "xlsx" });
  });
  it("offers the download until the Mac has synced, except for Word, which the browser can read", () => {
    expect(shownFile(f("OS/slides.pptx"))).toMatchObject({ kind: "convert" });
    expect(shownFile(f("OS/old.ppt"))).toMatchObject({ kind: "convert" });
    expect(shownFile(f("OS/notes.docx"))).toEqual({ kind: "docx", key: "k/OS/notes.docx", ext: "docx" });
  });
  it("prefers a note's web version", () => {
    expect(shownFile(f("OS/Guide.pdf", { key: "g.html", ext: "html" }))).toMatchObject({ kind: "html", key: "g.html" });
  });
});

describe("readTextHead", () => {
  it("reads a small file whole", async () => {
    expect(await readTextHead(new Blob(["int main() {}\n"]), 1024)).toEqual({ text: "int main() {}\n", cut: false });
  });

  it("reads only the start of a large file, ending on a whole line", async () => {
    const big = new Blob([Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n")]);
    const { text, cut } = await readTextHead(big, 100);
    expect(cut).toBe(true);
    expect(text.length).toBeLessThanOrEqual(100);
    const lines = text.split("\n");
    expect(lines[lines.length - 1]).toMatch(/^line \d+$/);
    expect(text.startsWith("line 0\nline 1")).toBe(true);
  });

  it("never shows half a character where the cut splits one", async () => {
    const { text } = await readTextHead(new Blob(["ok\n" + "é".repeat(50)]), 10);
    expect(text).toBe("ok");
    expect(text).not.toContain("\uFFFD");
  });
});

describe("parseDelimited with a row limit", () => {
  it("stops once it has the rows it was asked for", () => {
    const csv = Array.from({ length: 50_000 }, (_, i) => `${i},x`).join("\n");
    const rows = parseDelimited(csv, ",", 2001);
    expect(rows).toHaveLength(2001);
    expect(rows[2000]).toEqual(["2000", "x"]);
  });

  it("reads everything when the file is under the limit", () => {
    expect(parseDelimited("a,b\n1,2", ",", 10)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("the note frame", () => {
  it("opens every link in a new tab", () => {
    expect(noteDocument("<html><head><title>OS</title></head><body><a href='https://x'>x</a></body></html>")).toContain(
      '<head><base target="_blank"><title>OS</title>'
    );
  });

  it("runs no scripts or forms and can't navigate the app", () => {
    const allowed = NOTE_SANDBOX.split(" ");
    expect(allowed).toContain("allow-popups");
    for (const off of ["allow-scripts", "allow-forms", "allow-top-navigation", "allow-modals"]) expect(allowed).not.toContain(off);
  });
});
