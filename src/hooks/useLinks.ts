import { useQuery } from "@tanstack/react-query";
import { fetchLinksIndex, fetchPart } from "@/api/studyFiles";
import { usePin } from "@/hooks/useData";
import type { LinksPart } from "@/lib/connected";

/** A course's links (scripts/lib/links.mjs): the index, then that course's part; null while there are none. */
export function useLinks(course: string | null): LinksPart | null {
  const pin = usePin();
  const index = useQuery({ queryKey: ["links", pin], queryFn: () => fetchLinksIndex(pin), staleTime: 5 * 60_000 });
  const file = index.data?.courses.find((c) => c.course === course)?.file ?? null;
  const part = useQuery({
    queryKey: ["study-part", pin, file],
    queryFn: () => fetchPart<LinksPart>(pin, file!),
    enabled: file !== null,
    staleTime: Infinity,
    retry: 1,
  });
  return part.data ?? null;
}
