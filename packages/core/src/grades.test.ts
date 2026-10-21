import { describe, expect, it } from "vitest";
import { gradeForTotal } from "./grades.ts";
import { gradeWorking } from "./explain.ts";


describe("gradeForTotal", () => {
  it("maps totals to grades + points", () => {
    expect(gradeForTotal(95)).toEqual({ grade: "O", points: 10 });
    expect(gradeForTotal(85)).toEqual({ grade: "A+", points: 9 });
    expect(gradeForTotal(75)).toEqual({ grade: "A", points: 8 });
    expect(gradeForTotal(65)).toEqual({ grade: "B+", points: 7 });
    expect(gradeForTotal(58)).toEqual({ grade: "B", points: 6 });
    expect(gradeForTotal(52)).toEqual({ grade: "C", points: 5 });
    expect(gradeForTotal(40)).toEqual({ grade: "F", points: 0 });
  });

  it("uses inclusive lower bounds", () => {
    expect(gradeForTotal(91).grade).toBe("O");
    expect(gradeForTotal(90).grade).toBe("A+");
    expect(gradeForTotal(50).grade).toBe("C");
    expect(gradeForTotal(49).grade).toBe("F");
  });
});

describe("boundary tolerance", () => {
  it("does not mark a student down for a float ulp", () => {
    // Budget arithmetic - scaled weights, clamped shares, summed halves
    // - lands an exact 81 on 80.99999999999967 often enough to matter.
    expect(gradeForTotal(80.99999999999967).grade).toBe("A+");
    expect(gradeForTotal(70.9999999999999).grade).toBe("A");
    expect(gradeForTotal(90.99999999999999).grade).toBe("O");
  });

  it("still holds the line on a real shortfall", () => {
    // A tenth of a mark below is below. Only float noise is forgiven.
    expect(gradeForTotal(80.9).grade).toBe("A");
    expect(gradeForTotal(70.99).grade).toBe("B+");
    expect(gradeForTotal(49.999).grade).toBe("F");
  });
});

describe("the pass mark", () => {
  /** Confirmed with the user: SRM requires 50/100 overall in a subject and nothing else. */
  it("passes at 50 overall, however the 50 was assembled", () => {
    expect(gradeForTotal(50).grade).toBe("C");
    expect(gradeForTotal(49.5).grade).toBe("F");
    // A strong internal and a weak end-sem still clears it.
    expect(gradeForTotal(60 + 5).grade).toBe("B+");
    // As does a weak internal and a strong end-sem.
    expect(gradeForTotal(15 + 40).grade).toBe("C");
  });
});

describe("countsInSgpa", async () => {
  const { countsInSgpa, isNonGraded } = await import("./grades");
  it("leaves out audit and non-graded mandatory courses", () => {
    expect(countsInSgpa({ code: "21CSC201J", credits: 4 })).toBe(true);
    expect(countsInSgpa({ code: "21LEM201T", credits: 0 })).toBe(false);
    expect(countsInSgpa({ code: "21LEM202T", credits: 3 })).toBe(false);
    expect(countsInSgpa({ code: "21 LEM 302T", credits: 3 })).toBe(false);
    expect(isNonGraded("21MAB201T")).toBe(false);
  });
});

describe("a grade's working", () => {
  it("says where the total falls and what it's worth, with the same answer", () => {
    const w = gradeWorking(84.26);
    expect(w.value).toEqual(gradeForTotal(84.26));
    expect(w.steps.map((s) => s.say)).toEqual([
      "Your total is 84.3 out of 100.",
      "A+ is 81 or more, below 91, so 84.3 is A+.",
      "A+ is worth 9 grade points.",
    ]);
    expect(w.steps[1].sum).toBe("81 ≤ 84.3 < 91");
    expect(w.figures).toEqual({ total: 84.3, min: 81, next: 91, points: 9 });
  });

  it("has no grade above O", () => {
    expect(gradeWorking(96).steps[1]).toEqual({ say: "O is 91 or more, so 96 is O.", sum: "96 ≥ 91" });
  });
});
