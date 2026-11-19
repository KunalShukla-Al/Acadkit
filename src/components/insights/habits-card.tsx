import { useMemo } from "react";
import { Brain } from "lucide-react";
import { useArchives, useMarks, useSubjects } from "@/hooks/useData";
import { markHabits, markObservations } from "@acadkit/core/habits";

/** Semesters the record spans: this one, plus each archived one that kept marks. */
function semesters(archives: { summary?: { marks?: { items: unknown[] } }[] }[]) {
  return 1 + archives.filter((a) => (a.summary ?? []).some((r) => r.marks?.items.length)).length;
}

const pct = (x: number) => `${Math.round(x)}%`;

/**
 * Which kinds of assessment you score higher or lower on than your usual in
 * the same subject (habits.ts).
 */
export function MarkHabitsCard() {
  const { data: archives } = useArchives();
  const { data: marks } = useMarks();
  const { data: subjects } = useSubjects();
  const { kinds } = useMemo(() => markHabits(markObservations(archives ?? [], marks ?? [], subjects ?? [])), [archives, marks, subjects]);
  const shown = kinds.filter((k) => k.n >= 2);
  if (shown.length < 2) return null;
  const total = shown.reduce((a, k) => a + k.n, 0);
  const span = semesters(archives ?? []);
  return (
    <section className="card p-5" aria-label="How you score, by kind of assessment">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted">
        <Brain className="h-3.5 w-3.5" /> How you score, by kind
      </p>
      <ul className="space-y-2">
        {shown.map((k) => {
          const up = k.offset > 0.15;
          const down = k.offset < -0.15;
          return (
            <li key={k.kind} className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{k.label}</span>
              <span className="text-xs font-medium text-muted tabular">{k.n} marks</span>
              <span className="w-12 text-right text-sm font-bold tabular">{pct(k.pct)}</span>
              <span className={`w-28 text-right text-xs font-semibold ${up ? "text-good-deep" : down ? "text-bad-deep" : "text-muted"}`}>
                {up ? "above your usual" : down ? "below your usual" : "about your usual"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs font-medium text-muted">
        From {total} marks over {span} semester{span === 1 ? "" : "s"}, each compared with your average in the same subject.
      </p>
    </section>
  );
}
