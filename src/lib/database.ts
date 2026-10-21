import type { AbsentRow } from "@acadkit/core/absent";
import type {
  Assessment,
  AttendanceStatus,
  DeadlinePriority,
  DeadlineStatus,
  DeadlineType,
  DeclaredHoliday,
  Grade,
  MarkComponentType,
  MarkSource,
  PortalSnapshotHistory,
  SubjectArchiveRow,
  SubjectType,
} from "@acadkit/core/types";
import type { Database as Generated } from "@/lib/database.types";
import type { DeadlineSuggestionPayload, PaperSuggestionPayload, PlanSuggestionPayload, SuggestionStatus } from "@/lib/suggestions";
import type { PortalChanges } from "@/api/autopilot";

type Table = { Row: object; Insert: object; Update: object };

/** A table with some columns given the shapes the app stores in them; each keeps its optional and nullable marks. */
type Shaped<T extends Table, C> = Omit<T, "Row" | "Insert" | "Update"> & {
  Row: { [K in keyof T["Row"]]: K extends keyof C ? C[K] : T["Row"][K] };
  Insert: { [K in keyof T["Insert"]]: K extends keyof C ? C[K] : T["Insert"][K] };
  Update: { [K in keyof T["Update"]]: K extends keyof C ? C[K] : T["Update"][K] };
};

type Tables = Generated["public"]["Tables"];

type RequestStatus = "pending" | "done" | "skipped";

/**
 * What the generated types can't see: the shape of each jsonb column, and
 * the values a text column's CHECK constraint allows.
 */
type Narrowed = {
  subjects: Shaped<Tables["subjects"], { assessment: Assessment | null; type: SubjectType; target_grade: Exclude<Grade, "F"> | null }>;
  timetable_slots: Shaped<Tables["timetable_slots"], { slot_type: SubjectType }>;
  attendance: Shaped<Tables["attendance"], { status: AttendanceStatus }>;
  marks: Shaped<Tables["marks"], { component_type: MarkComponentType; source: MarkSource }>;
  deadlines: Shaped<Tables["deadlines"], { type: DeadlineType; status: DeadlineStatus; priority: DeadlinePriority }>;
  settings: Shaped<Tables["settings"], { declared_holidays: DeclaredHoliday[] }>;
  semester_archives: Shaped<Tables["semester_archives"], { summary: SubjectArchiveRow[] }>;
  portal_snapshot_history: Shaped<Tables["portal_snapshot_history"], { source: PortalSnapshotHistory["source"] }>;
  suggestions: Shaped<
    Tables["suggestions"],
    { kind: "deadline" | "plan" | "paper"; status: SuggestionStatus; payload: DeadlineSuggestionPayload | PlanSuggestionPayload | PaperSuggestionPayload }
  >;
  study_file_deletions: Shaped<Tables["study_file_deletions"], { status: RequestStatus }>;
  study_uploads: Shaped<Tables["study_uploads"], { status: RequestStatus }>;
  siri_marks: Shaped<Tables["siri_marks"], { rows: AbsentRow[] }>;
  autopilot_actions: Shaped<Tables["autopilot_actions"], { kind: "notice" | "portal"; changes: PortalChanges | null }>;
  forecast_log: Shaped<Tables["forecast_log"], { distribution: Record<string, number> | null }>;
};

/**
 * The schema as the app reads and writes it: the generated types
 * (database.types.ts, npm run db:types) with those columns narrowed.
 * The Supabase client is typed by it (src/lib/supabase.ts).
 */
export type Database = Omit<Generated, "public"> & {
  public: Omit<Generated["public"], "Tables"> & { Tables: Omit<Tables, keyof Narrowed> & Narrowed };
};

export type TableName = keyof Database["public"]["Tables"];
/** A row as read from `T`. */
export type Row<T extends TableName> = Database["public"]["Tables"][T]["Row"];
/** A row as written to `T`. */
export type Insert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
