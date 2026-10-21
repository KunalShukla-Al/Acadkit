import { describe, expect, it } from "vitest";
import { subjectShort, testTitle } from "./subjectShort.ts";

describe("subjectShort", () => {
  it("takes initials of the words that matter", () => {
    expect(subjectShort({ name: "Data Structures and Algorithms", short_name: null })).toBe("DSA");
    expect(subjectShort({ name: "Transforms and Boundary Value Problems", short_name: null })).toBe("TBVP");
    expect(subjectShort({ name: "Fundamentals of Data Science", short_name: null })).toBe("FDS");
    expect(subjectShort({ name: "Universal Human Values II", short_name: null })).toBe("UHVII");
  });
  it("keeps a typed short name and a one-word name", () => {
    expect(subjectShort({ name: "Operating Systems", short_name: "OS lab" })).toBe("OS lab");
    expect(subjectShort({ name: "Chemistry", short_name: "" })).toBe("Chemistry");
  });
});

describe("testTitle", () => {
  const os = { name: "Operating Systems", short_name: null };

  it("puts the subject in front of a title that doesn't name it", () => {
    expect(testTitle("End-sem", os)).toBe("OS End-sem");
    expect(testTitle("FT-III", os)).toBe("OS FT-III");
  });

  it("leaves a title that names it, or one with no subject", () => {
    expect(testTitle("OS FT-II", os)).toBe("OS FT-II");
    expect(testTitle("Lab record", undefined)).toBe("Lab record");
  });
});
