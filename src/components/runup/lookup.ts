import { useMemo } from "react";
import { useSubjects } from "@/hooks/useData";
import { formatDate } from "@acadkit/core/dates";
import { relativeDay, type RunupEvent } from "@/lib/runup";
import type { Subject } from "@acadkit/core/types";

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();

/** Your subjects by course code, so the plan's codes find their names and colours. */
export function useSubjectByCode(): (code: string | null | undefined) => Subject | null {
  const { data: subjects } = useSubjects();
  const map = useMemo(() => new Map((subjects ?? []).map((s) => [squash(s.code), s])), [subjects]);
  return (code) => (code ? (map.get(squash(code)) ?? null) : null);
}

/** When an event is: "Thu 29 Oct · in 17 days", or what's known about an undated one. */
export function eventWhen(event: RunupEvent, today: string): string {
  if (!event.date) return event.when ?? "date not announced";
  const day = formatDate(event.date, { weekday: "short" });
  return `${day} · ${relativeDay(today, event.date)}${event.when ? ` · ${event.when}` : ""}`;
}
