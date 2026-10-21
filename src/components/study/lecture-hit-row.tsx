import { Link } from "react-router-dom";
import { Mic } from "lucide-react";
import { subjectShort } from "@acadkit/core/subjectShort";
import { Snippet } from "@/components/study/file-row";
import { useSubjects } from "@/hooks/useData";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { lectureDay, momentClock, type LectureHit } from "@/lib/lectures";
import { baseName } from "@/lib/studyFiles";

/** A moment of a recorded lecture that matched a search (migration 061): what was said and the slide it was on, opening the transcript there. */
export function LectureHitRow({ hit, query }: { hit: LectureHit; query: string }) {
  const { data: subjects } = useSubjects();
  const viewerState = useViewerLinkState();
  const subject = subjects?.find((s) => s.code.trim().toUpperCase() === hit.subject_code?.trim().toUpperCase());
  const slide = hit.deck && hit.page ? hit.page : null;
  return (
    <Link
      to={`/lecture/${hit.lecture_id}?m=${hit.idx}`}
      state={viewerState}
      className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-surface-2/60"
    >
      <Mic className="mt-0.5 h-5 w-5 shrink-0 text-muted" strokeWidth={1.8} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">
          {subject ? `${subjectShort(subject)} lecture` : "Lecture"} · {lectureDay(hit.date)}, {momentClock(hit.start_time, hit.start_s)}
        </span>
        {slide && <span className="block truncate text-xs font-medium text-muted">Slide {slide} of {baseName(hit.deck!)}</span>}
        <Snippet content={hit.content} query={query} />
      </span>
    </Link>
  );
}
