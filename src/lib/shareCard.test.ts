import { describe, expect, it } from "vitest";
import { buildAttendanceShare, buildShareData } from "@/lib/shareCard";
import type { Grade } from "@acadkit/core/grades";

const DATE = new Date("2026-09-03T12:00:00Z");

function subject(code: string, grade: Grade, hasMarks = true) {
  return { code, grade, color: "#7c6af7", hasMarks };
}

describe("buildShareData", () => {
  it("formats SGPA to two decimals", () => {
    const d = buildShareData({
      sgpa: 8.6543,
      attendancePct: 82.4,
      subjects: [],
      date: DATE,
    });
    expect(d.sgpa).toBe("8.65");
    expect(d.sgpaLabel).toBe("predicted SGPA");
  });

  it("reads honestly when there is no SGPA yet", () => {
    const d = buildShareData({
      sgpa: null,
      attendancePct: null,
      subjects: [],
      date: DATE,
    });
    expect(d.sgpa).toBe("—");
    expect(d.sgpaLabel).toBe("no marks yet");
    expect(d.attendance).toBe("—");
  });

  it("rounds attendance to a whole percent", () => {
    const d = buildShareData({
      sgpa: 9,
      attendancePct: 74.6,
      subjects: [],
      date: DATE,
    });
    expect(d.attendance).toBe("75%");
  });

  it("uses the name when there is one", () => {
    expect(
      buildShareData({ name: "Kunal", sgpa: 9, attendancePct: 80, subjects: [], date: DATE })
        .title
    ).toBe("Kunal's semester");
    expect(
      buildShareData({ sgpa: 9, attendancePct: 80, subjects: [], date: DATE }).title
    ).toBe("My semester");
  });

  it("leaves out subjects with no marks", () => {
    const d = buildShareData({
      sgpa: 9,
      attendancePct: 80,
      subjects: [subject("21CSC201J", "A"), subject("21LEM201T", "F", false)],
      date: DATE,
    });
    expect(d.rows.map((r) => r.code)).toEqual(["21CSC201J"]);
  });

  it("caps the chip list so the card doesn't overflow", () => {
    const many = Array.from({ length: 12 }, (_, i) => subject(`SUB${i}`, "A"));
    expect(buildShareData({ sgpa: 9, attendancePct: 80, subjects: many, date: DATE }).rows)
      .toHaveLength(8);
  });

  it("stamps the semester and date in the footer", () => {
    const d = buildShareData({
      semester: 3,
      sgpa: 9,
      attendancePct: 80,
      subjects: [],
      date: DATE,
    });
    expect(d.footer).toContain("Semester 3");
    expect(d.footer).toContain("2026");
    expect(d.footer).toContain("AcadKit");
  });

  it("omits the semester when unknown", () => {
    const d = buildShareData({ sgpa: 9, attendancePct: 80, subjects: [], date: DATE });
    expect(d.footer).not.toContain("Semester");
  });
});

describe("buildAttendanceShare", () => {
  const sub = (label: string, percentage: number | null, min = 75) => ({ label, color: "#7c6af7", percentage, min });

  it("leads with the overall number and the classes behind it", () => {
    const d = buildAttendanceShare({ name: "Kunal", semester: 3, attended: 340, total: 400, percentage: 85, subjects: [], date: DATE });
    expect(d.title).toBe("Kunal's attendance");
    expect(d.overall).toBe("85%");
    expect(d.overallLabel).toBe("340 of 400 classes attended");
    expect(d.footer).toBe("Semester 3 · 3 Sept 2026 · AcadKit");
  });

  it("colours each subject against its own bar, and skips one with nothing marked", () => {
    const d = buildAttendanceShare({
      attended: 0,
      total: 0,
      percentage: null,
      subjects: [sub("DSA", 80), sub("OS", 70), sub("TBVP", 66, 65), sub("PE", 40), sub("UHV", null)],
      date: DATE,
    });
    expect(d.rows.map((r) => [r.label, r.value])).toEqual([["DSA", "80%"], ["OS", "70%"], ["TBVP", "66%"], ["PE", "40%"]]);
    expect(d.rows.map((r) => r.valueColor)).toEqual(["#4ade80", "#facc15", "#4ade80", "#fb7185"]);
    expect(d.overall).toBe("—");
    expect(d.overallLabel).toBe("no classes marked yet");
  });
});
