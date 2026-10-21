import { useQuery } from "@tanstack/react-query";
import { fetchLecture, fetchLectures } from "@/api/lectures";
import { usePin } from "@/hooks/useData";

/** Recorded lectures, newest first: the Mac adds them after class, so a few minutes' staleness is fine. */
export function useLectures() {
  const pin = usePin();
  return useQuery({ queryKey: ["lectures", pin], queryFn: () => fetchLectures(pin), staleTime: 5 * 60_000 });
}

export function useLecture(id: string) {
  const pin = usePin();
  return useQuery({ queryKey: ["lecture", pin, id], queryFn: () => fetchLecture(pin, id), staleTime: 5 * 60_000 });
}
