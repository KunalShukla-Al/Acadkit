export type SubjectType = "theory" | "lab";

/**
 * Declared here rather than in grades.ts because `Subject` needs it and
 * types.ts is the leaf: the other direction would be a cycle. grades.ts
 * re-exports it.
 */
export type Grade = "O" | "A+" | "A" | "B+" | "B" | "C" | "F";
/** A grade worth aiming for: never F (the subjects table's CHECK refuses it). */
export type TargetGrade = Exclude<Grade, "F">;

/** One declared internal component, in marks out of the internal weight. */
export interface PlannedComponent {
  /** Stable across edits so React keys and mark-matching survive renames. */
  key: string;
  label: string;
  type: MarkComponentType;
  max: number;
}

/** How a subject's /100 is built: the internal share, and the components that make it up. */
export interface Assessment {
  /** Internal share of the /100; the end-sem is the remainder. */
  internal: number;
  /** True when `components` is the whole internal breakdown. */
  complete: boolean;
  components: PlannedComponent[];
  /** What to expect of this subject's end-sem, as a percentage of it. */
  assumedExternalPct?: number | null;
  /**
   * Marks you expect from tests that have been sat but not returned,
   * keyed by `labelMatchKey`. Never counted as results - only the
   * Expected view in Insights reads them (expected.ts).
   */
  expected?: Record<string, ExpectedMark> | null;
}

/** What you think a test will return, in the units you entered it in. */
export interface ExpectedMark {
  obtained: number;
  max: number;
}

export interface Subject {
  id: string;
  device_id: string;
  code: string;
  name: string;
  credits: number;
  type: SubjectType;
  faculty: string | null;
  color_hex: string;
  /** Overrides the derived abbreviation in tight lists (migration 016). */
  short_name?: string | null;
  /** No end-sem exam - internals make the full /100 (migration 008). */
  internal_only?: boolean;
  /**
   * Internal/external split and the component breakdown (migration 021).
   * Null on subjects predating it - `assessmentFor` falls back to
   * `internal_only` and the 60/40 default.
   */
  assessment?: Assessment | null;
  /**
   * Medical leave granted for this subject (migration 023), which
   * condones the attendance bar from 75% down to 65%. Per subject
   * because ML is granted per case.
   */
  medical_leave?: boolean | null;
  /**
   * What you're actually aiming for here, which is not always what the
   * target SGPA implies - a subject you're weak in gets its own number
   * (migration 021). Null = derive it from settings.target_sgpa.
   */
  target_grade?: TargetGrade | null;
  created_at?: string;
}

export interface TimetableSlot {
  id: string;
  device_id: string;
  subject_id: string;
  day_order: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  room: string | null;
  /** Theory vs lab session of the subject (migration 008). */
  slot_type?: SubjectType;
  created_at?: string;
}

/** "holiday" is the DB value for a cancelled / no-class slot (constraint predates the rebuild; UI presents it as "Cancelled"). */
export type AttendanceStatus = "present" | "absent" | "holiday" | "od";

export interface AttendanceRecord {
  id: string;
  device_id: string;
  subject_id: string;
  date: string; // "YYYY-MM-DD"
  start_time: string;
  end_time: string;
  status: AttendanceStatus;
  /** Written by auto-marking, not the user (migration 013). */
  auto_marked?: boolean;
}

export type MarkComponentType = "CT" | "Lab" | "Assignment" | "Project" | "External";

export interface Mark {
  id: string;
  device_id: string;
  subject_id: string;
  component_type: MarkComponentType;
  label: string;
  marks_obtained: number;
  max_marks: number;
  is_external: boolean;
  /** "portal" rows are owned by the bookmarklet sync (migration 012). */
  source?: MarkSource;
  added_at?: string;
}

export type MarkSource = "manual" | "portal";

/**
 * One subject's attendance as the portal last reported it. The portal
 * only exposes totals, so this is the baseline that per-class records
 * after `as_of` are layered onto.
 */
export interface PortalSnapshot {
  id: string;
  device_id: string;
  subject_code: string;
  conducted: number;
  absent: number;
  /** Percentage as printed by the portal, for cross-checking the parse. */
  percentage: number | null;
  as_of: string; // "YYYY-MM-DD"
  synced_at?: string;
}

/**
 * One portal sync of one subject, kept (migration 029). portal_snapshots
 * holds the latest; this is the record of how it got there.
 */
export interface PortalSnapshotHistory {
  id: string;
  device_id: string;
  subject_code: string;
  conducted: number;
  absent: number;
  percentage: number | null;
  as_of: string; // "YYYY-MM-DD"
  synced_at: string;
  /** Where it came from; "screenshot" is a portal screenshot the Mac read (migration 058). */
  source: "bookmarklet" | "paste" | "restore" | "backfill" | "screenshot";
}

/** One week's forecast for a subject, or for the SGPA (`scope = "sgpa"`), migration 029. */
export interface ForecastLogRow {
  device_id: string;
  week_start: string; // Monday, "YYYY-MM-DD"
  scope: string;
  target: string | null;
  p_target: number | null;
  p_pass: number | null;
  median: number | null;
  p10: number | null;
  p90: number | null;
  distribution: Record<string, number> | null;
  evidence: number | null;
  model: string;
  created_at?: string;
}

export type DeadlineType = "exam" | "assignment" | "lab" | "other";
export type DeadlineStatus = "pending" | "done";
export type DeadlinePriority = "low" | "medium" | "high";

export interface Deadline {
  id: string;
  device_id: string;
  subject_id: string | null;
  title: string;
  type: DeadlineType;
  due_date: string; // ISO timestamp
  status: DeadlineStatus;
  priority: DeadlinePriority;
  /** What the test is out of, when it carries marks (migration 017). */
  max_marks?: number | null;
  /** The file Autopilot read it from, e.g. "Inbox/IMG_2041.jpg" (migration 053). */
  source?: string | null;
  created_at?: string;
}

export interface DeclaredHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export interface SubjectArchiveRow {
  code: string;
  name: string;
  credits: number;
  grade: string;
  points: number;
  /** /100 at archive time; null for a semester entered from a transcript, which only has grades. */
  total: number | null;
  attendancePct: number | null;
  color_hex: string;
  /** Shown as "A*". Set by hand when entering a transcript; no reason is stored. */
  starred?: boolean;
  /**
   * The grade card's attendance code, for semesters entered from it: a band,
   * not a percentage (H ≥95, 9 = 85–94, 8 = 75–84, L <75).
   */
  attendanceBand?: "H" | "9" | "8" | "L";
  /** Every class and the portal's count over the term (src/lib/archivePattern.ts); semesters archived from 2026-10. */
  attendance?: AttendancePattern;
  /** Every mark and the planned breakdown; semesters archived from 2026-10. */
  marks?: MarksPattern;
}

export interface SemesterArchive {
  id: string;
  device_id: string;
  label: string;
  sgpa: number | null;
  credits: number | null;
  summary: SubjectArchiveRow[];
  sem_start: string | null;
  sem_end: string | null;
  archived_at?: string;
}

export interface Settings {
  id: string;
  device_id: string;
  /** Display name for greetings; column added by migration 007 (optional). */
  name?: string | null;
  semester: number;
  target_sgpa: number;
  min_attendance: number;
  sem_start: string | null;
  sem_end: string | null;
  declared_holidays: DeclaredHoliday[];
  current_day_order: number;
  /** Assume past scheduled classes were attended (migration 013). */
  auto_mark_present?: boolean;
  /**
   * What to assume the end-sem returns, as a percentage of it
   * (migration 022). Null solves it like any other component.
   */
  assumed_external_pct?: number | null;
  /** Theme, synced across devices (migration 018). Null = never chosen. */
  theme?: string | null;
  theme_mode?: string | null;
  /** Evening minutes the study planner may use each day (migration 029). */
  study_evening_minutes?: number;
}

// ---------- what an archived semester keeps (src/lib/archivePattern.ts builds them) ----------

/** One class: [date, start "HH:MM", end "HH:MM", status, day order (null off the calendar), lab or theory, 1 if auto-marked]. */
export type ArchivedClass = [string, string, string, AttendanceStatus, number | null, SubjectType, 0 | 1];

export interface AttendancePattern {
  /** 2: classes carry end time, day order, session and auto-marking. */
  v?: 2;
  attended: number;
  /** Present + absent: cancelled classes don't count. */
  total: number;
  classes: ArchivedClass[];
  /** The portal's count over the term: [as_of "YYYY-MM-DD", conducted, absent], one per day it changed. */
  portal: [string, number, number][];
}

export interface ArchivedMark {
  type: MarkComponentType;
  label: string;
  got: number;
  max: number;
  external: boolean;
  /** When it was entered or synced, "YYYY-MM-DD". */
  on?: string | null;
  source?: "manual" | "portal" | null;
}

export interface MarksPattern {
  v?: 2;
  /** Every mark as entered or synced: what it was, out of what. */
  items: ArchivedMark[];
  /** How the /100 was planned: the internal share and its components. */
  plan: { internal: number; components: PlannedComponent[] } | null;
  /** Lab or theory, for the subject as a whole. */
  subjectType?: SubjectType;
  /** The weekly forecasts for this subject: [week "YYYY-MM-DD", median /100, p10, p90, chance of the target]. */
  forecasts?: [string, number | null, number | null, number | null, number | null][];
}
