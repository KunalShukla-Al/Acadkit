import { Link } from "react-router-dom";
import { ChevronRight, Mic } from "lucide-react";
import { useLectures } from "@/hooks/useLectures";
import { useViewerLinkState } from "@/hooks/useViewerLink";
import { lectureDay, lectureLength, momentClock } from "@/lib/lectures";
import { baseName } from "@/lib/studyFiles";

const SHOWN = 5;

/** A subject's recorded lectures, newest first, each opening its transcript; nothing until the Mac has one. */
export function RecordedLectures({ code }: { code: string }) {
  const { data } = useLectures();
  const viewerState = useViewerLinkState();
  const mine = (data ?? []).filter((l) => l.subject_code?.trim().toUpperCase() === code.trim().toUpperCase());
  if (mine.length === 0) return null;
  return (
    <section className="card divide-y overflow-hidden p-0">
      <p className="flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-muted">
        <Mic className="h-3 w-3" /> Recorded lectures · {mine.length}
      </p>
      {mine.slice(0, SHOWN).map((l) => {
        const length = lectureLength(l.seconds);
        return (
          <Link key={l.id} to={`/lecture/${l.id}`} state={viewerState} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                {lectureDay(l.date)}, {momentClock(l.start_time, 0)}
                {length && <span className="font-medium text-muted"> · {length}</span>}
              </span>
              {l.deck && <span className="block truncate text-xs font-medium text-muted">{baseName(l.deck)}</span>}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
          </Link>
        );
      })}
    </section>
  );
}
