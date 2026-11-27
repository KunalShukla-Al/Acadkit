import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDesk } from "@/api/desk";
import { fetchPart } from "@/api/studyFiles";
import { useDeskProgress, usePin } from "@/hooks/useData";
import { useTodayISO } from "@/hooks/useRunup";
import { progressMap, visibleCourses, type DeskCourse, type DeskIndexCourse } from "@/lib/desk";

/**
 * The Desk's index: the courses shown today, their tests and the semester's
 * windows. A course past its `showUntil` (Sem 3's OS after its end-sem) drops out.
 */
export function useDeskIndex() {
  const pin = usePin();
  const today = useTodayISO();
  const index = useQuery({
    queryKey: ["desk", pin],
    queryFn: () => fetchDesk(pin),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const courses = useMemo(() => visibleCourses(index.data?.courses ?? [], today), [index.data, today]);
  return { index, courses, windows: index.data?.windows ?? [], today };
}

/** One course's part. Named by its content, so one fetched is never fetched again. */
export function useDeskCourse(entry: DeskIndexCourse | null) {
  const pin = usePin();
  return useQuery({
    queryKey: ["study-part", pin, entry?.file ?? null],
    queryFn: () => fetchPart<DeskCourse>(pin, entry!.file),
    enabled: !!entry,
    staleTime: Infinity,
    retry: 1,
  });
}

/** Progress rows by item key. */
export function useDeskProgressMap() {
  const q = useDeskProgress();
  const map = useMemo(() => progressMap(q.data), [q.data]);
  return { ...q, map };
}
