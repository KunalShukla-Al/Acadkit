import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Presentation } from "lucide-react";
import { subjectShort } from "@acadkit/core/subjectShort";
import { Skeleton } from "@/components/ui/misc";
import { useQuery } from "@tanstack/react-query";
import { fetchStudyManifest } from "@/api/studyFiles";
import { ConnectedLine } from "@/components/connected-line";
import { usePin, useSubjects } from "@/hooks/useData";
import { useLecture } from "@/hooks/useLectures";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { courseOfCode, courseOfPath, momentId } from "@/lib/connected";
import { lectureDay, lectureLength, momentClock, slideRuns } from "@/lib/lectures";
import { baseName } from "@/lib/studyFiles";
import { cn } from "@/lib/utils";
import { viewerHref } from "@/lib/viewer";
import { studyPath } from "@/lib/screens";

/**
 * A recorded lecture's transcript (migration 061), in runs on one slide,
 * each opening its slide in the file viewer. `?m=` is the moment to start
 * at, from a search. Full screen like the viewer, and able to open over
 * the page it came from.
 */
export default function Lecture({ overlay = false }: { overlay?: boolean }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const viewerState = useViewerLinkState();
  const { data, isLoading } = useLecture(id);
  const { data: subjects } = useSubjects();
  const target = params.get("m");
  const targetRef = useRef<HTMLParagraphElement>(null);

  const lecture = data?.lecture;
  const pin = usePin();
  const manifest = useQuery({ queryKey: ["study-files", pin], queryFn: () => fetchStudyManifest(pin), staleTime: 5 * 60_000 });
  // Its course folder, for what links to each moment: the deck's, else the one the sync tagged with its code.
  const course = lecture?.deck ? courseOfPath(lecture.deck) : courseOfCode(manifest.data?.files, lecture?.subject_code ?? null);
  const subject = subjects?.find((s) => s.code.trim().toUpperCase() === lecture?.subject_code?.trim().toUpperCase());
  const title = subject ? `${subjectShort(subject)} lecture` : "Lecture";

  useEffect(() => {
    if (!lecture) return;
    document.title = `${title}, ${lectureDay(lecture.date)} · AcadKit`;
    return () => {
      document.title = "AcadKit";
    };
  }, [lecture, title]);

  // Over a page, the page beneath keeps its place (as the viewer does).
  useEffect(() => {
    if (!overlay) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = before;
    };
  }, [overlay]);

  useEffect(() => {
    targetRef.current?.scrollIntoView({ block: "center" });
  }, [data]);

  function back() {
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate(subject ? `/subject/${encodeURIComponent(subject.code)}` : studyPath());
  }

  const length = lectureLength(lecture?.seconds ?? null);
  return (
    <div className={cn("flex flex-col bg-bg", overlay ? "h-full" : "h-dvh")}>
      <header className="z-20 shrink-0 border-b bg-bg pt-safe-t">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={back}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{title}</p>
            {lecture && (
              <p className="truncate text-[11px] font-medium text-muted">
                {lectureDay(lecture.date)} · {momentClock(lecture.start_time, 0)}
                {length && ` · ${length}`}
                {lecture.deck && ` · ${baseName(lecture.deck)}`}
              </p>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-5 px-4 py-5 pb-safe-b">
          {isLoading && (
            <>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-24 w-full" />
            </>
          )}
          {!isLoading && !data && <p className="py-16 text-center text-sm font-medium text-muted">This lecture isn't here any more.</p>}
          {data && data.moments.length === 0 && <p className="py-16 text-center text-sm font-medium text-muted">Nothing was transcribed from this one.</p>}
          {data &&
            slideRuns(data.moments).map((run) => (
              <section key={run.moments[0].idx} className="space-y-2">
                {run.page && lecture?.deck ? (
                  <Link
                    to={viewerHref(lecture.deck, run.page)}
                    state={viewerState}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-accent-deep"
                  >
                    <Presentation className="h-3.5 w-3.5" /> Slide {run.page}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <p className="text-xs font-bold uppercase tracking-widest text-muted">Off the slides</p>
                )}
                {run.moments.map((m) => {
                  const here = target === String(m.idx);
                  return (
                    <div key={m.idx} className="space-y-1.5">
                      <p
                        ref={here ? targetRef : undefined}
                        className={cn("rounded-xl text-sm leading-relaxed", here && "-mx-2 bg-accent/10 px-2 py-1")}
                      >
                        <span className="mr-2 font-mono text-xs text-muted">{lecture && momentClock(lecture.start_time, m.start_s)}</span>
                        {m.content}
                      </p>
                      {/* Its slide heads the run already. */}
                      {lecture && <ConnectedLine course={course} ids={[momentId(lecture.memo, m.idx)]} hide={(l) => l.kind === "slide" && l.why === "time"} />}
                    </div>
                  );
                })}
              </section>
            ))}
        </div>
      </main>
    </div>
  );
}
