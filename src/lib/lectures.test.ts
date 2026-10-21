import { describe, expect, it } from "vitest";
import { lectureDay, lectureHits, lectureLength, momentClock, slideRuns, type LectureHit } from "@/lib/lectures";

const hit = (similarity: number, subject_code: string | null = "21CSC202J"): LectureHit => ({
  lecture_id: "l1", idx: 0, start_s: 0, page: null, content: "", similarity, date: "2026-11-03", start_time: "10:05:00", subject_code, deck: null,
});

describe("lecture moments in search", () => {
  it("shows the near ones, best first, and one subject's when asked", () => {
    const moments = [hit(0.81), hit(0.88), hit(0.94, "21CSC201J"), hit(0.83)];
    expect(lectureHits(moments).map((m) => m.similarity)).toEqual([0.94, 0.88, 0.83]);
    expect(lectureHits(moments, "21csc202j ").map((m) => m.similarity)).toEqual([0.88, 0.83]);
    expect(lectureHits(moments, undefined, 1)).toHaveLength(1);
  });

  it("names a moment by its day and clock time", () => {
    expect(momentClock("10:05:00", 9 * 60 + 40)).toBe("10:14");
    expect(momentClock("23:50:00", 900)).toBe("00:05");
    expect(lectureDay("2026-11-03")).toMatch(/^Tue,? 3 Nov$/);
  });
});

describe("the transcript view", () => {
  const m = (idx: number, page: number | null) => ({ idx, start_s: idx * 60, end_s: idx * 60 + 60, content: `m${idx}`, page });

  it("groups moments in runs on one slide, keeping talk off the slides apart", () => {
    const runs = slideRuns([m(0, 3), m(1, 3), m(2, null), m(3, 4), m(4, 3)]);
    expect(runs.map((r) => [r.page, r.moments.map((x) => x.idx)])).toEqual([[3, [0, 1]], [null, [2]], [4, [3]], [3, [4]]]);
    expect(slideRuns([])).toEqual([]);
  });

  it("says a lecture's length plainly", () => {
    expect([lectureLength(2880), lectureLength(3720), lectureLength(null)]).toEqual(["48 min", "1 h 02 min", null]);
  });
});
