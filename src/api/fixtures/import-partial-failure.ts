/**
 * An import that fails partway (v2 release blocker 9).
 *
 * The backup is an export someone edited by hand: one mark's component type was changed to
 * "Quiz", which the marks table's check constraint rejects (migration 005). `importData` runs
 * its steps in order, so by the time the marks insert fails it has already added the new
 * subject, replaced the timetable and written the attendance. The deadlines step never runs.
 */
import type { AttendanceRecord, Deadline, Mark, Subject, TimetableSlot } from "@acadkit/core/types";
import type { AcadkitExport } from "@/api/account";

const PIN = "0404";
const FILE = "9999";

const subject = (id: string, device_id: string, code: string, name: string): Subject => ({
  id,
  device_id,
  code,
  name,
  credits: 4,
  type: "theory",
  faculty: null,
  color_hex: "#7c6af7",
});

const slot = (id: string, device_id: string, subject_id: string, day_order: number, start_time: string, end_time: string): TimetableSlot => ({
  id,
  device_id,
  subject_id,
  day_order,
  start_time,
  end_time,
  room: null,
});

/** The account before the import: OS with two classes, one marked, and one test due. */
const account: Record<string, Record<string, unknown>[]> = {
  subjects: [{ ...subject("here-os", PIN, "21CSC202J", "Operating Systems") }],
  timetable_slots: [
    { ...slot("slot-os-1", PIN, "here-os", 1, "08:00:00", "08:50:00") },
    { ...slot("slot-os-3", PIN, "here-os", 3, "10:40:00", "11:30:00") },
  ],
  attendance: [
    { id: "att-os-1", device_id: PIN, subject_id: "here-os", date: "2026-11-02", start_time: "08:00:00", end_time: "08:50:00", status: "present", auto_marked: false },
  ],
  marks: [
    { id: "m-os-ft1", device_id: PIN, subject_id: "here-os", component_type: "CT", label: "FT-1", marks_obtained: 13, max_marks: 15, is_external: false, source: "manual" },
  ],
  deadlines: [
    { id: "dl-os-end", device_id: PIN, subject_id: "here-os", title: "OS end-sem", type: "exam", due_date: "2026-11-30T08:30:00Z", status: "pending", priority: "high", max_marks: 75 },
  ],
  portal_snapshots: [],
  portal_snapshot_history: [],
  forecast_log: [],
  semester_archives: [],
  settings: [],
};

const attendance = (id: string, subject_id: string, date: string, start_time: string, end_time: string, status: AttendanceRecord["status"]): AttendanceRecord => ({
  id,
  device_id: FILE,
  subject_id,
  date,
  start_time,
  end_time,
  status,
});

const mark = (id: string, subject_id: string, component_type: string, label: string, marks_obtained: number, max_marks: number): Mark => ({
  id,
  device_id: FILE,
  subject_id,
  // The edited file carries a type the app never writes; the cast stands in for its JSON.
  component_type: component_type as Mark["component_type"],
  label,
  marks_obtained,
  max_marks,
  is_external: false,
  source: "manual",
});

const deadline: Deadline = {
  id: "file-dl-dsa",
  device_id: FILE,
  subject_id: "file-dsa",
  title: "DSA end-sem",
  type: "exam",
  due_date: "2026-11-26T08:30:00Z",
  status: "pending",
  priority: "high",
  max_marks: 75,
};

/** The edited export: OS plus DSA, a new timetable, two classes, two marks and a deadline. */
const backup: AcadkitExport = {
  acadkit_export: 1,
  subjects: [subject("file-os", FILE, "21CSC202J", "Operating Systems"), subject("file-dsa", FILE, "21CSC201J", "Data Structures and Algorithms")],
  timetable: [
    slot("file-slot-1", FILE, "file-os", 2, "09:45:00", "10:35:00"),
    slot("file-slot-2", FILE, "file-dsa", 2, "10:40:00", "11:30:00"),
    slot("file-slot-3", FILE, "file-dsa", 4, "08:00:00", "08:50:00"),
  ],
  attendance: [
    attendance("file-att-1", "file-os", "2026-11-03", "09:45:00", "10:35:00", "present"),
    attendance("file-att-2", "file-dsa", "2026-11-03", "10:40:00", "11:30:00", "absent"),
  ],
  marks: [mark("file-m-1", "file-dsa", "CT", "FT-1", 12, 15), mark("file-m-2", "file-dsa", "Quiz", "Quiz 1", 4, 5)],
  deadlines: [deadline],
};

export const IMPORT_PARTIAL_FAILURE = {
  pin: PIN,
  account,
  backup,
  options: { subjects: true, history: true, deadlines: true, holidays: false, archives: false },
  /** The call the database rejects, and how PostgREST reports it. */
  failsAt: "insert:marks",
  error: { code: "23514", message: 'new row for relation "marks" violates check constraint "marks_component_type_check"' },
};
