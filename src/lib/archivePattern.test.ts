import { describe, expect, it } from "vitest";
import { attendanceLine, attendancePattern, marksPattern } from "@/lib/archivePattern";
import type { AttendanceRecord, ForecastLogRow, Mark, PortalSnapshotHistory, Subject, TimetableSlot } from "@acadkit/core/types";

const os = { id: "s1", code: "21CSC202J", type: "theory", assessment: { internal: 60, complete: true, components: [{ key: "ct1", label: "CT-1", type: "CT", max: 15 }] } } as unknown as Subject;
const rec = (date: string, start: string, status: AttendanceRecord["status"], subject_id = "s1") =>
  ({ subject_id, date, start_time: start, end_time: "11:30:00", status }) as AttendanceRecord;
const snap = (as_of: string, conducted: number, absent: number, synced_at: string, subject_code = "21CSC202J") =>
  ({ subject_code, as_of, conducted, absent, synced_at }) as PortalSnapshotHistory;

describe("attendancePattern", () => {
  it("keeps every class in order, and the portal's count on the days it moved", () => {
    const p = attendancePattern(
      os,
      [rec("2026-08-12", "10:40:00", "absent"), rec("2026-08-11", "08:00:00", "present"), rec("2026-08-11", "08:00:00", "present", "other")],
      [
        snap("2026-08-20", 20, 2, "2026-08-20T09:00:00Z"),
        snap("2026-08-20", 21, 2, "2026-08-20T18:00:00Z"), // the day's last reading wins
        snap("2026-08-21", 21, 2, "2026-08-21T09:00:00Z"), // unchanged: dropped
        snap("2026-08-25", 24, 3, "2026-08-25T09:00:00Z"),
        snap("2026-08-25", 9, 9, "2026-08-25T09:00:00Z", "21MAB201T"),
      ],
      { attended: 22, total: 24 },
      // 12 Aug was day order 3, where this subject's 10:40 slot is its lab.
      { dayOrders: { "2026-08-12": 3 }, timetable: [{ subject_id: "s1", day_order: 3, start_time: "10:40:00", slot_type: "lab" }] as TimetableSlot[] }
    );
    expect(p.classes).toEqual([
      ["2026-08-11", "08:00", "11:30", "present", null, "theory", 0],
      ["2026-08-12", "10:40", "11:30", "absent", 3, "lab", 0],
    ]);
    expect(p.portal).toEqual([
      ["2026-08-20", 21, 2],
      ["2026-08-25", 24, 3],
    ]);
    expect(attendanceLine(p)).toBe("Attended 22 of 24 · missed 2");
  });

  it("says nothing for a subject with no classes counted", () => {
    expect(attendanceLine(attendancePattern(os, [], [], undefined))).toBeNull();
    expect(attendanceLine(undefined)).toBeNull();
  });
});

describe("marksPattern", () => {
  it("keeps every mark of the subject and how its /100 was planned", () => {
    const marks = [
      { subject_id: "s1", component_type: "CT", label: "CT-1", marks_obtained: 13.5, max_marks: 15, is_external: false },
      { subject_id: "s2", component_type: "CT", label: "CT-1", marks_obtained: 1, max_marks: 15, is_external: false },
    ] as Mark[];
    const forecasts = [
      { scope: "s1", week_start: "2026-09-28", median: 78, p10: 70, p90: 85, p_target: 0.4 },
      { scope: "s1", week_start: "2026-09-21", median: 80, p10: 71, p90: 86, p_target: 0.5 },
      { scope: "sgpa", week_start: "2026-09-21", median: 8.4, p10: 8, p90: 8.8, p_target: 0.3 },
    ] as ForecastLogRow[];
    expect(marksPattern(os, marks, forecasts)).toEqual({
      v: 2,
      items: [{ type: "CT", label: "CT-1", got: 13.5, max: 15, external: false, on: null, source: null }],
      plan: { internal: 60, components: [{ key: "ct1", label: "CT-1", type: "CT", max: 15 }] },
      subjectType: "theory",
      forecasts: [
        ["2026-09-21", 80, 71, 86, 0.5],
        ["2026-09-28", 78, 70, 85, 0.4],
      ],
    });
    expect(marksPattern({ ...os, assessment: null } as Subject, []).plan).toBeNull();
  });
});
