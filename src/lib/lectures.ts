/**
 * Lectures the Mac recorded and transcribed (migration 061,
 * scripts/lib/recorder.mjs): what the app finds in them and how it names
 * a moment in one.
 */

/** A recorded lecture: the class it was of and the deck it followed. */
export interface Lecture {
  id: string;
  /** The Voice Memos file, which stays on the Mac. */
  memo: string;
  date: string;
  start_time: string;
  seconds: number | null;
  subject_code: string | null;
  class_start: string | null;
  class_end: string | null;
  deck: string | null;
  words: number;
}

/** About a minute of what was said, and the slide it was on. */
export interface LectureMoment {
  idx: number;
  start_s: number;
  end_s: number;
  content: string;
  page: number | null;
}

/** A lecture's moments in runs on one slide (page null: off the slides), as the transcript view shows them. */
export function slideRuns(moments: LectureMoment[]): { page: number | null; moments: LectureMoment[] }[] {
  const runs: { page: number | null; moments: LectureMoment[] }[] = [];
  for (const m of moments) {
    const last = runs[runs.length - 1];
    if (last && last.page === m.page) last.moments.push(m);
    else runs.push({ page: m.page, moments: [m] });
  }
  return runs;
}

/** "48 min", "1 h 02 min". */
export function lectureLength(seconds: number | null): string | null {
  if (!seconds) return null;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min` : `${minutes} min`;
}

/** A lecture moment the study-search function returned. */
export interface LectureHit {
  lecture_id: string;
  idx: number;
  /** Seconds into the lecture. */
  start_s: number;
  /** The deck's page it was on, as the file viewer numbers it; null for talk off the slides. */
  page: number | null;
  content: string;
  similarity: number;
  /** "YYYY-MM-DD". */
  date: string;
  /** "HH:MM:SS", when the recording began. */
  start_time: string;
  subject_code: string | null;
  /** The study-folder path of the deck the lecture followed. */
  deck: string | null;
}

/**
 * A query at least this like a moment is about it. Probing gte-small with
 * short queries, the moments that answered one scored 0.82–0.94 and the
 * rest at most 0.81.
 */
export const MOMENT_NEAR = 0.82;

const norm = (code: string | null) => (code ?? "").trim().toUpperCase();

/** The moments worth showing for a search, best first: near enough, and one subject's when `code` is given. */
export function lectureHits(moments: LectureHit[], code?: string, limit = 3): LectureHit[] {
  return moments
    .filter((m) => m.similarity >= MOMENT_NEAR && (!code || norm(m.subject_code) === norm(code)))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** "10:14": the clock time `start_s` seconds into a lecture that began at `start_time`. */
export function momentClock(start_time: string, start_s: number): string {
  const [h, m, s = 0] = start_time.split(":").map(Number);
  const at = Math.floor((h * 3600 + m * 60 + s + start_s) / 60);
  return `${String(Math.floor(at / 60) % 24).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
}

/** "Tue, 3 Nov", from "2026-11-03". */
export function lectureDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
