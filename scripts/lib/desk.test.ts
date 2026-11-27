import { describe, expect, it } from "vitest";
import { checkDesk, mergeDesks, splitDesk } from "./desk.mjs";

const item = (over = {}) => ({
  key: "PS/ps-ct-1/A1", unit: 1, topic: "ps_rv", topicName: "Random variables", kind: "ct", paper: "CLA-1", slot: "A1",
  part: "A", marks: 1, mcq: true, text: "Mean of a fair die?", options: ["3", "3.5", "4", "6"], answer: "B", note: null,
  file: "Probability/CT.pdf", page: 2, date: "2025-02-01", repeats: 1, solution: null, ...over,
});

const desk = (courses, over = {}) => ({ version: 1, semester: "Sem 4", built: "2026-11-27", windows: [{ key: "ft1", label: "FT-I window", start: "2027-01-25", end: "2027-02-03" }], courses, ...over });
const course = (over = {}) => ({ key: "PS", code: "21MAB301T", name: "Probability and Statistics", tests: [], units: [], items: [item()], ...over });

describe("checkDesk", () => {
  it("throws on a file that isn't a desk, so the sync keeps the last good one", () => {
    expect(() => checkDesk(null, new Set())).toThrow(/not a desk/);
    expect(() => checkDesk({ version: 2, courses: [] }, new Set())).toThrow(/not a desk/);
  });

  it("adds the next semester's folder to links it finds there", () => {
    const { body, warnings } = checkDesk(desk([course()]), new Set(["SRM_Sem4/Probability/CT.pdf"]), "SRM_Sem4");
    expect(warnings).toEqual([]);
    expect(body.courses[0].items[0].file).toBe("SRM_Sem4/Probability/CT.pdf");
    expect(body.courses[0].semester).toBe("Sem 4");
    expect(body.windows[0]).toMatchObject({ key: "ft1", semester: "Sem 4" });
  });

  it("clears a missing file with one warning per course, keeping the item", () => {
    const { body, warnings } = checkDesk(desk([course({ items: [item(), item({ key: "PS/ps-ct-1/A2", solution: { file: "gone.pdf", page: 1 } })] })]), new Set());
    expect(body.courses[0].items.map((i) => [i.file, i.solution])).toEqual([[null, null], [null, null]]);
    expect(warnings).toEqual(["PS: 3 file link(s) not in the study folder, shown without a link"]);
  });

  it("drops bad and repeated items and courses, and keys that don't fit", () => {
    const { body, warnings } = checkDesk(
      desk([
        course({ items: [item(), item(), item({ key: "DAA/x/A1" }), item({ key: "PS/x/A3", text: " " }), item({ key: "PS/x/A4", part: "E" })] }),
        course(),
        { key: "bad key", name: "x" },
      ]),
      new Set(["Probability/CT.pdf"])
    );
    expect(body.courses.map((c) => c.key)).toEqual(["PS"]);
    expect(body.courses[0].items.map((i) => i.key)).toEqual(["PS/ps-ct-1/A1"]);
    expect(warnings).toHaveLength(6);
  });

  it("keeps an answer only when it names one of the options", () => {
    const { body } = checkDesk(desk([course({ items: [item({ answer: "D", options: ["a", "b"] }), item({ key: "PS/x/A2", answer: "b" })] })]), new Set());
    expect(body.courses[0].items.map((i) => i.answer)).toEqual([null, null]);
  });

  it("follows a file moved since the last sync", () => {
    const moved = new Map([["Probability/CT.pdf", "Probability/CTs/CT.pdf"]]);
    const { body, follows } = checkDesk(desk([course()]), new Set(["Probability/CTs/CT.pdf"]), "", moved);
    expect(body.courses[0].items[0].file).toBe("Probability/CTs/CT.pdf");
    expect(follows).toEqual([["Probability/CT.pdf", "Probability/CTs/CT.pdf"]]);
  });
});

describe("mergeDesks and splitDesk", () => {
  it("puts this semester's courses first and writes one part per course", () => {
    const os = checkDesk(desk([course({ key: "OS", name: "Operating Systems", showUntil: "2026-11-30", items: [item({ key: "OS/x/A1" })] })], { semester: "Sem 3", windows: [] }), new Set()).body;
    const sem4 = checkDesk(desk([course(), course({ key: "OS", name: "Duplicate" })]), new Set()).body;
    const merged = mergeDesks([os, sem4]);
    expect(merged.courses.map((c) => `${c.key} ${c.name}`)).toEqual(["OS Operating Systems", "PS Probability and Statistics"]);

    const { index, parts } = splitDesk(merged);
    expect(index.courses.map((c) => [c.key, c.items, c.keyed, c.showUntil])).toEqual([["OS", 1, 1, "2026-11-30"], ["PS", 1, 1, null]]);
    expect(parts.map((p) => p.name)).toEqual([index.courses[0].file, index.courses[1].file]);
    expect(index.courses[0].file).toMatch(/^desk\/OS-[0-9a-f]{12}\.json$/);
    // A part never changes once named: same content, same name.
    expect(splitDesk(merged).parts[1].name).toBe(parts[1].name);
  });
});
