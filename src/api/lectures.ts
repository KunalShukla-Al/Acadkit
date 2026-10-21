import { supabase } from "@/lib/supabase";
import { throwIf } from "@/api/db";
import type { Lecture, LectureMoment } from "@/lib/lectures";

const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";
const LECTURE = "id, memo, date, start_time, seconds, subject_code, class_start, class_end, deck, words";

/** This account's recorded lectures, newest first (migration 061); none before the migration. */
export async function fetchLectures(pin: string): Promise<Lecture[]> {
  const { data, error } = await supabase.from("lectures").select(LECTURE).eq("device_id", pin).order("date", { ascending: false }).order("start_time", { ascending: false });
  if (missingTable(error)) return [];
  throwIf(error);
  return data ?? [];
}

/** One lecture and its moments in order, or null when it isn't this account's (or is gone). */
export async function fetchLecture(pin: string, id: string): Promise<{ lecture: Lecture; moments: LectureMoment[] } | null> {
  const lecture = await supabase.from("lectures").select(LECTURE).eq("device_id", pin).eq("id", id).maybeSingle();
  if (missingTable(lecture.error)) return null;
  throwIf(lecture.error);
  if (!lecture.data) return null;
  const moments = await supabase.from("lecture_moments").select("idx, start_s, end_s, content, page").eq("lecture_id", id).order("idx");
  throwIf(moments.error);
  return { lecture: lecture.data, moments: moments.data ?? [] };
}
