import { describe, expect, it } from "vitest";
import { planPortalMarks } from "./portalMarks.ts";

describe("where a portal mark lands", () => {
  const subjects = [{ id: "os", code: "21CSC202J" }];
  const mark = (label: string, obtained: number) => ({ subject_code: "21csc202j ", label, max_marks: 15, marks_obtained: obtained, component_type: "CT" as const });

  it("updates the test's row, the portal's own before one typed by hand, and adds the rest", () => {
    const existing = [
      { id: "typed", subject_id: "os", label: "CT-1", source: "manual" },
      { id: "portal", subject_id: "os", label: "FT-I", source: "portal" },
    ];
    const plan = planPortalMarks("1234", [mark("FT-1", 13), mark("FT-II", 11), { ...mark("FT-I", 1), subject_code: "21CSC999J" }], subjects, existing);
    expect(plan.updates.map((u) => [u.id, u.label, u.marks_obtained])).toEqual([["portal", "FT-1", 13]]);
    expect(plan.inserts.map((i) => [i.label, i.source, i.subject_id])).toEqual([["FT-II", "portal", "os"]]);
    expect(plan.unmatched).toEqual(["21CSC999J"]);
  });
});
