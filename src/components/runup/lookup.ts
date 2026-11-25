import { useMemo } from "react";
import { useDeadlines, useMarks, useSubjects } from "@/hooks/useData";
import { useProjectionReport } from "@/hooks/useProjectionReport";
import { formatDate, todayISO } from "@acadkit/core/dates";
import { endSemAims, relativeDay, squashCode, type RunupEvent, type RunupTarget } from "@/lib/runup";
import type { Subject } from "@acadkit/core/types";

/** Your subjects by course code, so the plan's codes find their names and colours. */
export function useSubjectByCode(): (code: string | null | undefined) => Subject | null {
  const { data: subjects } = useSubjects();
  const map = useMemo(() => new Map((subjects ?? []).map((s) => [squashCode(s.code), s])), [subjects]);
  return (code) => (code ? (map.get(squashCode(code)) ?? null) : null);
}

/**
 * An event's aim. An end-sem takes the one Marks → Targets shows; any
 * other event, or an end-sem Marks can't solve, keeps the plan's target.
 */
export function useRunupTarget(): (event: RunupEvent) => RunupTarget | null {
  const { report } = useProjectionReport();
  const { data: marks } = useMarks();
  const { data: deadlines } = useDeadlines();
  const aims = useMemo(
    () => endSemAims(report.gradeProjections, marks ?? [], deadlines ?? [], todayISO()),
    [report.gradeProjections, marks, deadlines]
  );
  return (event) => (event.kind === "endsem" ? aims.get(squashCode(event.subject_code)) : undefined) ?? event.target;
}

/** When an event is: "Thu 29 Oct · in 17 days", or what's known about an undated one. */
export function eventWhen(event: RunupEvent, today: string): string {
  if (!event.date) return event.when ?? "date not announced";
  const day = formatDate(event.date, { weekday: "short" });
  return `${day} · ${relativeDay(today, event.date)}${event.when ? ` · ${event.when}` : ""}`;
}
