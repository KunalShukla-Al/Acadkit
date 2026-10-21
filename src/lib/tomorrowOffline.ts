import type { QueryClient } from "@tanstack/react-query";
import { fetchDeadlines } from "@/api/deadlines";
import { fetchSettings } from "@/api/settings";
import { fetchStudyManifest, fetchStudyPrep, keepStudyFile } from "@/api/studyFiles";
import { fetchSubjects } from "@/api/subjects";
import { fetchTimetable } from "@/api/timetable";
import { upcomingPrep } from "@/lib/examPrep";
import { tomorrowFiles, writeTomorrow, type TomorrowState } from "@/lib/tomorrow";
import { nextWorkingDate, semesterWindow } from "@acadkit/core/calendar";
import { toISODate } from "@acadkit/core/dates";
import { today } from "@acadkit/core/today";

let running = false;

/**
 * Keep the next class day's files on this device: work out the day (the
 * next date with a day order), its classes and its tests, pick their files
 * and fetch what isn't here yet. Files already here cost nothing, so a
 * second run in the same evening only fetches what's new.
 */
export async function keepTomorrow(pin: string, qc: QueryClient, now = new Date()): Promise<TomorrowState | null> {
  if (running) return null;
  running = true;
  try {
    const query = <T,>(key: string, fn: () => Promise<T>) => qc.fetchQuery({ queryKey: [key, pin], queryFn: fn, staleTime: 5 * 60_000 });
    const [settings, subjects, slots, deadlines, manifest, prep] = await Promise.all([
      query("settings", () => fetchSettings(pin)),
      query("subjects", () => fetchSubjects(pin)),
      query("timetable", () => fetchTimetable(pin)),
      query("deadlines", () => fetchDeadlines(pin)),
      query("study-files", () => fetchStudyManifest(pin)),
      query("study-prep", () => fetchStudyPrep(pin)),
    ]);
    const next = nextWorkingDate(toISODate(now), settings?.declared_holidays ?? [], semesterWindow(settings));
    if (!next) return null;
    const day = today({ date: next.date, settings, subjects, slots, attendance: [], snapshots: [], deadlines });
    const tests = upcomingPrep(prep, now.getTime()).filter((t) => toISODate(new Date(t.due_date)) === next.date);
    const picked = tomorrowFiles({ files: manifest?.files ?? [], tests, courses: [...new Set(day.classes.map((c) => c.code))] });
    let ready = 0;
    let bytes = 0;
    for (const f of picked) {
      if (await keepStudyFile(f)) {
        ready += 1;
        bytes += f.size;
      }
    }
    const state: TomorrowState = { date: next.date, files: picked.length, ready, bytes, at: Date.now() };
    writeTomorrow(state);
    return state;
  } finally {
    running = false;
  }
}
