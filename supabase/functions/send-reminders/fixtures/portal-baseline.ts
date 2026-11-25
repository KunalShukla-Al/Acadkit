/**
 * A portal sync on a class day, made before that day's classes: Day Order 1 on 12 Nov 2026,
 * synced at 07:32 IST, then OS at 09:45 (present) and 10:40 (absent).
 *
 * The app counts the classes marked after the sync (packages/core/src/attendance.ts
 * afterSnapshot), so Attendance shows 43 of 62. The reminders drop the snapshot's whole day
 * and read 42 of 60 (v2 release blocker 8).
 */
export const PORTAL_BASELINE = {
  subject: { id: "sub-os", code: "21CSC202J", name: "Operating Systems", medical_leave: false },
  snapshot: {
    subject_code: "21CSC202J",
    conducted: 60,
    absent: 18,
    percentage: 70,
    as_of: "2026-11-12",
    synced_at: "2026-11-12T02:02:00Z",
  },
  slots: [
    { id: "tt-os-1", subject_id: "sub-os", day_order: 1, start_time: "09:45:00" },
    { id: "tt-os-2", subject_id: "sub-os", day_order: 1, start_time: "10:40:00" },
  ],
  marks: [
    { subject_id: "sub-os", date: "2026-11-12", start_time: "09:45:00", status: "present" as const },
    { subject_id: "sub-os", date: "2026-11-12", start_time: "10:40:00", status: "absent" as const },
  ],
  eff: { "2026-11-12": 1 },
  semStart: "2026-07-21",
  semEnd: "2026-11-18",
  /** When the reminders look: that evening, after both classes. */
  asked: { date: "2026-11-12", start: "16:00" },
  /** What Attendance shows: the portal's 42 of 60, plus the two classes marked since. */
  expected: { attended: 43, total: 62 },
};
