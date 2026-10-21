import { describe, expect, it } from "vitest";
import {
  extOf,
  formatSize,
  groupHits,
  pastPaperGroups,
  baseName,
  pyqLabel,
  highlight,
  isReferenceFolder,
  listFolder,
  prettyName,
  searchFiles,
  type StudyFile,
  storageLevel,
} from "./studyFiles";

const f = (path: string, size = 1000): StudyFile => ({ path, size, mtime: 0, key: `0000/blobs/${path.length}` });

const FILES = [
  f("00_OVERVIEW.pdf"),
  f("OS_21CSC202J/02_Notes/Unit1_OS.pptx"),
  f("OS_21CSC202J/02_Notes/Unit2_OS.pdf"),
  f("OS_21CSC202J/Syllabus.pdf"),
  f("DSA_21CSC201J/02_Notes/Unit10.pdf"),
  f("DSA_21CSC201J/02_Notes/Unit2.pdf"),
  f("CodIn_Java/Java_Weeks_1-3.html"),
];

describe("past-paper notes", () => {
  const base = { path: "AI/07_PYQs/x.pdf", size: 1, mtime: 0 };
  it("labels an old or poorly scanned paper and ranks it lower at a tie", () => {
    const old = { ...base, key: "p/blobs/a.pdf", pyq: { status: "old" as const, quality: "poor" as const } };
    const fine = { ...base, key: "p/blobs/b.pdf" };
    expect(pyqLabel(old)).toBe("old syllabus · poor scan");
    expect(pyqLabel(fine)).toBeNull();
    const hits = [
      { file_key: "p/blobs/a.pdf", chunk_index: 0, page: 1, content: "", similarity: 0.9 },
      { file_key: "p/blobs/b.pdf", chunk_index: 0, page: 1, content: "", similarity: 0.89 },
    ];
    expect(groupHits(hits, [old, fine]).map((g) => g.file.key)).toEqual(["p/blobs/b.pdf", "p/blobs/a.pdf"]);
  });
});

describe("listFolder", () => {
  it("shows top-level folders with recursive counts, then root files", () => {
    const v = listFolder(FILES, "");
    expect(v.folders.map((x) => [x.name, x.count])).toEqual([
      ["CodIn_Java", 1],
      ["DSA_21CSC201J", 2],
      ["OS_21CSC202J", 3],
    ]);
    expect(v.files.map((x) => x.path)).toEqual(["00_OVERVIEW.pdf"]);
  });

  it("marks Syllabi at the top as reference, and only there", () => {
    expect(isReferenceFolder("", "Syllabi")).toBe(true);
    expect(isReferenceFolder("", "SYLLABI")).toBe(true);
    expect(isReferenceFolder("OS_21CSC202J", "Syllabi")).toBe(false);
    expect(isReferenceFolder("", "SRM_Sem4")).toBe(true);
    expect(isReferenceFolder("SRM_Sem4", "SRM_Sem4")).toBe(false);
    expect(isReferenceFolder("", "01_Syllabus_Plan_Handout")).toBe(false);
  });

  it("lists a nested folder, sorting numbers naturally", () => {
    const v = listFolder(FILES, "DSA_21CSC201J/02_Notes");
    expect(v.folders).toEqual([]);
    expect(v.files.map((x) => x.path)).toEqual(["DSA_21CSC201J/02_Notes/Unit2.pdf", "DSA_21CSC201J/02_Notes/Unit10.pdf"]);
  });

  it("does not treat a folder whose name only starts the same as a child", () => {
    const v = listFolder([f("OS/a.pdf"), f("OS_Lab/b.pdf")], "OS");
    expect(v.files.map((x) => x.path)).toEqual(["OS/a.pdf"]);
  });
});

describe("searchFiles", () => {
  it("matches every word in any order, across folder and file names", () => {
    expect(searchFiles(FILES, "os unit 1").map((x) => x.path)).toEqual(["OS_21CSC202J/02_Notes/Unit1_OS.pptx"]);
  });

  it("matches words written without the separator, but numbers only whole", () => {
    expect(searchFiles(FILES, "unit1").map((x) => x.path)).toEqual(["OS_21CSC202J/02_Notes/Unit1_OS.pptx"]);
    expect(searchFiles(FILES, "unit 10").map((x) => x.path)).toEqual(["DSA_21CSC201J/02_Notes/Unit10.pdf"]);
  });

  it("matches the start of a word", () => {
    expect(searchFiles(FILES, "syll").map((x) => x.path)).toEqual(["OS_21CSC202J/Syllabus.pdf"]);
  });

  it("puts matches in the file name ahead of matches only in a folder", () => {
    expect(searchFiles(FILES, "os").map((x) => x.path)[0]).toBe("OS_21CSC202J/02_Notes/Unit1_OS.pptx");
  });

  it("returns nothing for a blank query", () => {
    expect(searchFiles(FILES, "   ")).toEqual([]);
  });
});

describe("helpers", () => {
  it("reads extensions case-insensitively and ignores dotfiles", () => {
    expect(extOf("a/B.PDF")).toBe("pdf");
    expect(extOf("a/.hidden")).toBe("");
  });

  it("formats sizes and names", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(12.2 * 1024 * 1024)).toBe("12.2 MB");
    expect(formatSize(1024 ** 3)).toBe("1 GB");
    expect(formatSize(1.5 * 1024 ** 3)).toBe("1.5 GB");
    expect(prettyName("OS_21CSC202J")).toBe("OS 21CSC202J");
  });
});

describe("storageLevel", () => {
  const MB = 1024 * 1024;
  const at = (used: number, refused: { path: string; size: number }[] = []) => ({ version: 1 as const, used, limit: 1024 * MB, cap: 950 * MB, refused, at: 0 });

  it("is ok, then high from 85% of the cap, then full at the cap or once a file is turned away", () => {
    expect(storageLevel(at(510 * MB))).toBe("ok");
    expect(storageLevel(at(808 * MB))).toBe("high");
    expect(storageLevel(at(950 * MB))).toBe("full");
    expect(storageLevel(at(600 * MB, [{ path: "scan.pdf", size: 400 * MB }]))).toBe("full");
  });
});

describe("groupHits", () => {
  const files = [
    { path: "OS_21CSC202J/Notes/Unit3.pdf", size: 1, mtime: 0, key: "p/blobs/a.pdf" },
    { path: "OS_21CSC202J/Copy/Unit3.pdf", size: 1, mtime: 0, key: "p/blobs/a.pdf" },
    { path: "DSA_21CSC201J/Heaps.pptx", size: 1, mtime: 0, key: "p/blobs/b.pptx" },
  ];
  const hit = (file_key: string, similarity: number, page: number | null = 1) => ({
    file_key,
    chunk_index: 0,
    page,
    content: "text",
    similarity,
  });

  it("groups passages by file, best file first, one path per content", () => {
    const groups = groupHits([hit("p/blobs/b.pptx", 0.8), hit("p/blobs/a.pdf", 0.9, 4), hit("p/blobs/a.pdf", 0.7, 2)], files);
    expect(groups.map((g) => g.file.path)).toEqual(["OS_21CSC202J/Notes/Unit3.pdf", "DSA_21CSC201J/Heaps.pptx"]);
    expect(groups[0].hits.map((h) => h.page)).toEqual([4, 2]);
  });

  it("drops passages from files no longer in the folder", () => {
    expect(groupHits([hit("p/blobs/gone.pdf", 0.99)], files)).toEqual([]);
  });
});

describe("highlight", () => {
  it("marks the query's words and centres on the first one", () => {
    const parts = highlight("Intro text. The Banker's algorithm avoids deadlock by checking safe states.", "bankers deadlock", 60);
    expect(parts.filter((p) => p.hit).map((p) => p.text.toLowerCase())).toEqual(["deadlock"]);
    const text = parts.map((p) => p.text).join("");
    expect(text.toLowerCase()).toContain("deadlock");
  });

  it("returns the passage unmarked for a query with no usable words", () => {
    expect(highlight("some passage", "a b")).toEqual([{ text: "some passage", hit: false }]);
  });
});

describe("recentFiles", async () => {
  const { recentFiles } = await import("./studyFiles");
  const now = Date.parse("2026-09-28T12:00:00Z");
  const f = (path: string, daysAgo: number, kind?: string) =>
    ({ path, size: 1, mtime: now - daysAgo * 86_400_000, key: path, kind }) as never;
  it("lists the last fortnight's files, newest first, without papers and syllabi", () => {
    const out = recentFiles([f("a.pdf", 20), f("b.pdf", 1), f("c.pdf", 3), f("p.pdf", 0, "pyq"), f("s.pdf", 0, "syllabus")], now);
    expect(out.map((x: { path: string }) => x.path)).toEqual(["b.pdf", "c.pdf"]);
  });
});

describe("pastPaperGroups", () => {
  const f = (path: string) => ({ path, size: 1, mtime: 0, key: path, kind: "pyq" as const });
  it("groups papers by exam: tests in order, then end-sems, old syllabus apart, then the rest", () => {
    const groups = pastPaperGroups([
      f("DSA/07_PYQs/End_Sem/Nov_2024_End_Sem_Paper.pdf"),
      f("DSA/07_PYQs/FJ-III/2024_FJ-III_SetA_Key.pdf"),
      f("DSA/07_PYQs/FJ-I/2023_CT1_SetA_AnswerKey.pdf"),
      f("DSA/07_PYQs/End_Sem/Jul_2025_End_Sem_Paper.pdf"),
      f("DSA/07_PYQs/End_Sem/Old_Syllabus_18CSC201J/Dec_2023_End_Sem_Paper.pdf"),
      f("DSA/07_PYQs/Question_Banks/GATE.docx"),
      f("DSA/07_PYQs/FJ-II/2025_FJ-II_SetC_Key.pdf"),
      f("P&S/07_PYQs/21MAB204T_Probability_and_Queueing_Theory/End_Sem/May_2024.pdf"),
      f("DSA/07_PYQs/loose.pdf"),
    ]);
    expect(groups.map((g) => g.label)).toEqual([
      "FJ-I",
      "FJ-II",
      "FJ-III",
      "End sem",
      "End sem · old syllabus",
      "Question Banks",
      "Probability and Queueing Theory (21MAB204T, another course)",
      "Other papers",
    ]);
    expect(groups[3].files.map((x) => baseName(x.path))).toEqual(["Jul_2025_End_Sem_Paper.pdf", "Nov_2024_End_Sem_Paper.pdf"]);
  });
  it("reads the next semester's mirror the same way", () => {
    const [g] = pastPaperGroups([f("SRM_Sem4/Artificial_Intelligence/07_PYQs/CT_Papers/x.pdf")]);
    expect(g.label).toBe("CT papers");
  });
});
