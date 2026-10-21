import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildSpace, courseFiles, paperLabel, spaceSummary } from "./connected.mjs";

let root: string;
let transcripts: string;
// Each file its own content: vectors are cached by content.
const put = async (rel: string, body = rel) => {
  await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
  await writeFile(path.join(root, rel), body);
};
// One axis per text, by its first letter, so the vectors are known.
const embed = async (texts: string[]) => texts.map((t) => [0, 1, 2].map((k) => (k === "pqm".indexOf(t[0]) ? 1 : 0)));
const long = (first: string) => `${first}${"a".repeat(60)}`;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "connected-"));
  await put("Operating_Systems/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx");
  await put("Operating_Systems/02_Notes/Unit_4/Paging_notes.pdf");
  await put("Operating_Systems/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg");
  await put("Operating_Systems/02_Notes/Class_Photos/2026-11-03/IMG_2.jpg");
  // A course folder is found by its title, as the sync tags files; a transcript names its class by code.
  await put("_src/acadkit_syllabi.json", JSON.stringify({ courses: { "21CSC202J": { code: "21CSC202J", title: "Operating Systems" } } }));
  await put("Inbox/waiting.pdf");
  await put("Syllabi/OS.pdf");
  await put("Operating_Systems/07_PYQs/es.pdf");
  await put("_src/pyq_dataset/papers.tsv", "subject\tpaper\tkind\ttest\tsession\tdate\tset\tscope\tchoice\tfile\tnote\nOS\tos-es-2025-12\tend\tEND\tEND\t2025-12\t-\tmain\t-\tOperating_Systems/07_PYQs/es.pdf\t\n");
  await put("_src/pyq_dataset/questions.tsv", `subject\tpaper\tslot\tmarks\ttopic\ttype\ttext\nOS\tos-es-2025-12\tB21\t8\tpaging\tE\t${long("q")}\nOS\tos-es-2025-12\tA1\t1\tpaging\tR\tshort\n`);
  await put("_src/pyq_dataset/topics.tsv", "subject\ttopic\tunit\tname\nOS\tpaging\t4\tPaging\n");
  transcripts = await mkdtemp(path.join(tmpdir(), "transcripts-"));
  await writeFile(
    path.join(transcripts, "a.json"),
    JSON.stringify({ memo: "a.m4a", date: "2026-11-03", time: "10:05", class: { code: "21CSC202J", type: "theory" }, deck: "Operating_Systems/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx", moments: [{ start: 0, end: 60, text: "m", page: 2, vector: [0, 0, 1] }, { start: 125, end: 180, text: "m", page: null, vector: [0, 0, 1] }] })
  );
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(transcripts, { recursive: true, force: true });
});

describe("the embedding space", () => {
  it("takes the courses' files, not Inbox, Syllabi, _src or past papers", async () => {
    expect(await courseFiles(root)).toEqual([
      "Operating_Systems/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg",
      "Operating_Systems/02_Notes/Class_Photos/2026-11-03/IMG_2.jpg",
      "Operating_Systems/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx",
      "Operating_Systems/02_Notes/Unit_4/Paging_notes.pdf",
    ]);
  });

  it("holds pages, slides, questions, moments and photos, each with its course, unit and time", async () => {
    const photo = path.join(root, "Operating_Systems/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg");
    await utimes(photo, new Date("2026-11-03T04:50:00Z"), new Date("2026-11-03T04:50:00Z"));
    const read = async (full: string) =>
      full.endsWith("IMG_1.jpg") ? { pages: [long("m")] } : full.endsWith("IMG_2.jpg") ? { pages: ["ok"] } : full.endsWith(".pptx") ? { pages: [long("p"), long("m")] } : { pages: [long("p")] };
    const { items, means } = await buildSpace({ dir: root, transcriptsDir: transcripts, embed, read, cacheDir: path.join(root, "cache") });
    const brief = items.map((i: { id: string; course: string | null; unit: number | null; at?: string }) => [i.id, i.course, i.unit, i.at ?? null]);
    expect(brief).toEqual([
      ["photo:Operating_Systems/02_Notes/Class_Photos/2026-11-03/IMG_1.jpg", "Operating_Systems", null, "2026-11-03T10:20"],
      ["slide:Operating_Systems/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx#1", "Operating_Systems", 3, null],
      ["slide:Operating_Systems/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx#2", "Operating_Systems", 3, null],
      ["page:Operating_Systems/02_Notes/Unit_4/Paging_notes.pdf#1", "Operating_Systems", 4, null],
      ["question:os-es-2025-12#B21", "Operating_Systems", 4, null],
      ["moment:a.m4a#0", "Operating_Systems", 3, "2026-11-03T10:05"],
      ["moment:a.m4a#1", "Operating_Systems", 3, "2026-11-03T10:07"],
    ]);
    expect(items.find((i: { id: string }) => i.id === "moment:a.m4a#0").ref).toEqual({ memo: "a.m4a", idx: 0, deck: "Operating_Systems/02_Notes/Unit_3/CPU_Scheduling_Slides.pptx", page: 2 });
    expect(items.find((i: { id: string }) => i.id === "moment:a.m4a#0").slot).toBeUndefined();
    expect(Object.keys(means)).toEqual(["Operating_Systems"]);
    expect(spaceSummary(items)).toEqual(["Operating_Systems: 1 page · 2 slides · 1 question · 2 moments · 1 photo"]);
  });
});

describe("a question's label", () => {
  it("names its paper and month", () => {
    expect(paperLabel({ kind: "end", test: "END", date: "2025-12" })).toBe("End-sem Dec 2025");
    expect(paperLabel({ kind: "ct", test: "CT-1", date: "2026-09" })).toBe("CT-1 Sep 2026");
    expect(paperLabel({ kind: "ct", test: "FT-II", date: "" })).toBe("FT-II");
  });
});
