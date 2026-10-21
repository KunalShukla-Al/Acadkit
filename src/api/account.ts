/** The whole account at once: clearing, deleting, exporting and importing it. */

import { labelMatchKey } from "@acadkit/core/componentLabel";
import type {
  AttendanceRecord,
  Deadline,
  ForecastLogRow,
  Mark,
  PortalSnapshot,
  PortalSnapshotHistory,
  SemesterArchive,
  Settings,
  Subject,
  TimetableSlot,
} from "@acadkit/core/types";
import type { Insert } from "@/lib/database";
import { supabase } from "@/lib/supabase";
import { fetchAttendance } from "@/api/attendance";
import { isMissingTable, replaceRows, throwIf } from "@/api/db";
import { fetchDeadlines } from "@/api/deadlines";
import { fetchArchives, fetchForecasts, logForecasts } from "@/api/history";
import { fetchMarks } from "@/api/marks";
import {
  appendSnapshotHistory,
  clearPortalSnapshots,
  fetchPortalSnapshots,
  fetchSnapshotHistory,
} from "@/api/portal";
import { fetchSettings, updateSettings } from "@/api/settings";
import { fetchSubjects } from "@/api/subjects";
import { fetchTimetable } from "@/api/timetable";

/**
 * Wipe the active semester's academic data (keeps settings + archives). The
 * portal and forecast history the app can't delete go when the Mac moves to
 * the next folder (scripts/lib/semester.mjs).
 */
export async function clearAcademicData(pin: string): Promise<void> {
  // subjects cascade to timetable_slots, attendance, marks
  for (const table of ["deadlines", "subjects", "timetable_slots", "attendance", "marks"] as const) {
    const { error } = await supabase.from(table).delete().eq("device_id", pin);
    throwIf(error);
  }
  // may not exist until migration 012 is run
  await clearPortalSnapshots(pin);
}

export async function deleteAllData(pin: string): Promise<void> {
  // subjects cascade to timetable_slots, attendance, marks
  for (const table of [
    "deadlines",
    "subjects",
    "timetable_slots",
    "attendance",
    "marks",
    "settings",
  ] as const) {
    const { error } = await supabase.from(table).delete().eq("device_id", pin);
    throwIf(error);
  }
  // archives / snapshots tables may not exist; nothing else is ignored
  const { error } = await supabase.from("semester_archives").delete().eq("device_id", pin);
  if (!isMissingTable(error)) throwIf(error);
  await clearPortalSnapshots(pin);
  // The feeds' token (migration 047): nothing should read an account after it is wiped.
  const { error: tokenError } = await supabase.from("feed_tokens").delete().eq("device_id", pin);
  if (!isMissingTable(tokenError)) throwIf(tokenError);
}

/** Everything the account holds, as one file. */
export async function exportAllData(pin: string) {
  const [
    settings,
    subjects,
    timetable,
    attendance,
    marks,
    deadlines,
    archives,
    portalSnapshots,
    snapshotHistory,
    forecasts,
  ] = await Promise.all([
    fetchSettings(pin),
    fetchSubjects(pin),
    fetchTimetable(pin),
    fetchAttendance(pin),
    fetchMarks(pin),
    fetchDeadlines(pin),
    fetchArchives(pin),
    fetchPortalSnapshots(pin),
    fetchSnapshotHistory(pin),
    fetchForecasts(pin),
  ]);
  return {
    acadkit_export: 1,
    exported_at: new Date().toISOString(),
    settings,
    subjects,
    timetable,
    attendance,
    marks,
    deadlines,
    archives,
    portal_snapshots: portalSnapshots,
    // The two histories (migration 029) - what the analysis notebook reads.
    snapshot_history: snapshotHistory,
    forecasts,
  };
}

export interface AcadkitExport {
  acadkit_export?: number;
  subjects?: Subject[];
  timetable?: TimetableSlot[];
  attendance?: AttendanceRecord[];
  marks?: Mark[];
  deadlines?: Deadline[];
  settings?: Partial<Settings> | null;
  archives?: SemesterArchive[];
  portal_snapshots?: PortalSnapshot[];
  snapshot_history?: PortalSnapshotHistory[];
  forecasts?: ForecastLogRow[];
}

export interface ImportOptions {
  subjects: boolean; // subjects + timetable
  history: boolean; // attendance, marks and portal totals
  deadlines: boolean;
  holidays: boolean; // declared holidays + sem dates
  archives: boolean; // past semesters
}

export interface ImportResult {
  subjects: number;
  slots: number;
  attendance: number;
  marks: number;
  deadlines: number;
  archives: number;
}

const codeKey = (code: string) => code.trim().toUpperCase();

/** Import a previously-exported file. */
export async function importData(
  pin: string,
  data: AcadkitExport,
  opts: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = { subjects: 0, slots: 0, attendance: 0, marks: 0, deadlines: 0, archives: 0 };
  const current = await fetchSubjects(pin);
  const codeToId = new Map(current.map((s) => [codeKey(s.code), s.id]));
  const importedIdToCode = new Map((data.subjects ?? []).map((s) => [s.id, codeKey(s.code)]));
  /** This account's id for a subject id from the file. */
  const localId = (importedId: string | null | undefined): string | undefined => {
    const code = importedId ? importedIdToCode.get(importedId) : undefined;
    return code ? codeToId.get(code) : undefined;
  };

  if (opts.subjects) {
    const rows = (data.subjects ?? [])
      .filter((s) => !codeToId.has(codeKey(s.code)))
      .map((s) => {
        const id = crypto.randomUUID();
        codeToId.set(codeKey(s.code), id);
        return {
          id,
          device_id: pin,
          code: s.code,
          name: s.name,
          credits: s.credits ?? 0,
          type: s.type ?? "theory",
          faculty: s.faculty ?? null,
          color_hex: s.color_hex ?? "#7c6af7",
          short_name: s.short_name ?? null,
          internal_only: s.internal_only ?? false,
          assessment: s.assessment ?? null,
          target_grade: s.target_grade ?? null,
          medical_leave: s.medical_leave ?? null,
        };
      });
    if (rows.length) {
      const { error } = await supabase.from("subjects").insert(rows);
      throwIf(error);
    }
    result.subjects = rows.length;

    const slots = (data.timetable ?? [])
      .map((sl) => {
        const sid = localId(sl.subject_id);
        if (!sid) return null;
        return {
          device_id: pin,
          subject_id: sid,
          day_order: sl.day_order,
          start_time: sl.start_time,
          end_time: sl.end_time,
          room: sl.room ?? null,
          slot_type: sl.slot_type ?? "theory",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (slots.length) await replaceRows("timetable_slots", pin, () => supabase.from("timetable_slots").insert(slots));
    result.slots = slots.length;
  }

  if (opts.history) {
    const attendance = (data.attendance ?? [])
      .map((r) => {
        const sid = localId(r.subject_id);
        if (!sid) return null;
        return {
          device_id: pin,
          subject_id: sid,
          date: r.date,
          start_time: r.start_time,
          end_time: r.end_time,
          status: r.status,
          auto_marked: r.auto_marked ?? false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (attendance.length) {
      // ignoreDuplicates: a class already marked here keeps its answer.
      // select() returns only the rows actually written.
      const { data: written, error } = await supabase
        .from("attendance")
        .upsert(attendance, { onConflict: "device_id,subject_id,date,start_time", ignoreDuplicates: true })
        .select("id");
      throwIf(error);
      result.attendance = written?.length ?? 0;
    }

    // A component this account already has - same subject, same label by
    // match key, same side of the split - is left alone rather than doubled.
    const markKey = (subjectId: string, m: Pick<Mark, "label" | "is_external">) =>
      `${subjectId}|${labelMatchKey(m.label)}|${m.is_external ? "x" : "i"}`;
    const have = new Set((await fetchMarks(pin)).map((m) => markKey(m.subject_id, m)));
    const marks: Insert<"marks">[] = [];
    for (const m of data.marks ?? []) {
      const sid = localId(m.subject_id);
      if (!sid || have.has(markKey(sid, m))) continue;
      have.add(markKey(sid, m));
      marks.push({
        device_id: pin,
        subject_id: sid,
        component_type: m.component_type,
        label: m.label,
        marks_obtained: m.marks_obtained,
        max_marks: m.max_marks,
        is_external: m.is_external,
        source: m.source ?? "manual",
      });
    }
    if (marks.length) {
      const { error } = await supabase.from("marks").insert(marks);
      throwIf(error);
    }
    result.marks = marks.length;

    // Portal totals are the attendance baseline; a file's only wins where
    // it is newer than what this account already has.
    const here = new Map((await fetchPortalSnapshots(pin)).map((s) => [codeKey(s.subject_code), s.as_of]));
    const snapshots = (data.portal_snapshots ?? [])
      .filter((s) => {
        const asOf = here.get(codeKey(s.subject_code));
        return !asOf || s.as_of > asOf;
      })
      .map((s) => ({
        device_id: pin,
        subject_code: s.subject_code,
        conducted: s.conducted,
        absent: s.absent,
        percentage: s.percentage,
        as_of: s.as_of,
        synced_at: s.synced_at ?? new Date().toISOString(),
      }));
    if (snapshots.length) {
      const { error } = await supabase
        .from("portal_snapshots")
        .upsert(snapshots, { onConflict: "device_id,subject_code" });
      throwIf(error);
    }

    // The histories are appended: a sync this account already has (same
    // subject, same moment) is not recorded twice.
    const seen = new Set(
      (await fetchSnapshotHistory(pin)).map((h) => `${codeKey(h.subject_code)}|${h.synced_at}`)
    );
    await appendSnapshotHistory(
      (data.snapshot_history ?? [])
        .filter((h) => !seen.has(`${codeKey(h.subject_code)}|${h.synced_at}`))
        .map((h) => ({
          device_id: pin,
          subject_code: h.subject_code,
          conducted: h.conducted,
          absent: h.absent,
          percentage: h.percentage,
          as_of: h.as_of,
          synced_at: h.synced_at,
        })),
      "restore"
    );
    // Forecasts name subjects by id; carry over the ones that map here.
    await logForecasts(
      (data.forecasts ?? [])
        .map((f) => ({
          device_id: pin,
          week_start: f.week_start,
          scope: f.scope === "sgpa" ? "sgpa" : (localId(f.scope) ?? ""),
          target: f.target,
          p_target: f.p_target,
          p_pass: f.p_pass,
          median: f.median,
          p10: f.p10,
          p90: f.p90,
          distribution: f.distribution,
          evidence: f.evidence,
          model: f.model,
        }))
        .filter((f) => f.scope !== "")
    );
  }

  if (opts.deadlines) {
    const deadlines = (data.deadlines ?? []).map((d) => ({
      device_id: pin,
      subject_id: localId(d.subject_id) ?? null,
      title: d.title,
      type: d.type,
      due_date: d.due_date,
      status: d.status ?? "pending",
      priority: d.priority ?? "medium",
      max_marks: d.max_marks ?? null,
    }));
    if (deadlines.length) await replaceRows("deadlines", pin, () => supabase.from("deadlines").insert(deadlines));
    result.deadlines = deadlines.length;
  }

  if (opts.archives) {
    const labels = new Set((await fetchArchives(pin)).map((a) => a.label.trim().toLowerCase()));
    const archives = (data.archives ?? [])
      .filter((a) => !labels.has(a.label.trim().toLowerCase()))
      .map((a) => ({
        device_id: pin,
        label: a.label,
        sgpa: a.sgpa,
        credits: a.credits,
        summary: a.summary ?? [],
        sem_start: a.sem_start,
        sem_end: a.sem_end,
        ...(a.archived_at ? { archived_at: a.archived_at } : {}),
      }));
    if (archives.length) {
      const { error } = await supabase.from("semester_archives").insert(archives);
      throwIf(error);
    }
    result.archives = archives.length;
  }

  if (opts.holidays && data.settings) {
    await updateSettings(pin, {
      declared_holidays: data.settings.declared_holidays ?? [],
      ...(data.settings.sem_start ? { sem_start: data.settings.sem_start } : {}),
      ...(data.settings.sem_end ? { sem_end: data.settings.sem_end } : {}),
    });
  }

  return result;
}
