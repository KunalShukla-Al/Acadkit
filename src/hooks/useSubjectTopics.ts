import { useQuery } from "@tanstack/react-query";
import { fetchPart, fetchStudyTopics } from "@/api/studyFiles";
import { usePin } from "@/hooks/useData";
import type { SubjectTopics } from "@/lib/examPrep";

const norm = (code: string) => code.replace(/\s/g, "").toUpperCase();

/**
 * One subject's past-paper topics: the index, then that subject's file
 * (scripts/study-index/topics.mjs), or its entry in a topics.json from a
 * sync before the split.
 */
export function useSubjectTopics(code: string): { data: SubjectTopics | null; isLoading: boolean } {
  const pin = usePin();
  const index = useQuery({ queryKey: ["study-topics", pin], queryFn: () => fetchStudyTopics(pin), staleTime: 5 * 60_000 });
  const subjects = index.data?.subjects ?? [];
  const entry = subjects.find((s) => norm(s.subject_code) === norm(code)) ?? null;
  const file = entry && "file" in entry ? entry.file : null;
  const part = useQuery({
    queryKey: ["study-part", pin, file],
    queryFn: () => fetchPart<SubjectTopics>(pin, file!),
    enabled: file !== null,
    staleTime: Infinity,
    retry: 1,
  });
  const data = entry && "topics" in entry ? entry : (part.data ?? null);
  return { data, isLoading: index.isLoading || (file !== null && part.isLoading) };
}
