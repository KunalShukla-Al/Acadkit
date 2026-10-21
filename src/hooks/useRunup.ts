import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchPart, fetchRunup, fetchStudyManifest } from "@/api/studyFiles";
import { usePin, usePlanTicks } from "@/hooks/useData";
import { toISODate } from "@acadkit/core/dates";
import { assemble, fromV1, type RunupData, type RunupEvent, type RunupMonth, type RunupPyq } from "@/lib/runup";

/** Today's date, moving on at midnight while the app stays open. */
export function useTodayISO(): string {
  const [today, setToday] = useState(() => toISODate(new Date()));
  useEffect(() => {
    const tick = () => setToday(toISODate(new Date()));
    const id = setInterval(tick, 30_000);
    // An installed app resumed from the background has been asleep, not counting.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return today;
}

/** The month files, all or nothing. */
function allMonths(results: UseQueryResult<RunupMonth>[]) {
  return {
    data: results.every((r) => r.data) ? results.map((r) => r.data!) : null,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}

/**
 * The run-up plan, what's ticked, and the study files its links point at.
 * The plan is an index plus a file per month (scripts/lib/runup.mjs); a part
 * is named by its content, so one fetched is never fetched again.
 */
export function useRunup() {
  const pin = usePin();
  const index = useQuery({
    queryKey: ["runup", pin],
    queryFn: () => fetchRunup(pin),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const months = useQueries({
    queries: (index.data?.version === 2 ? index.data.months : []).map((name) => ({
      queryKey: ["study-part", pin, name],
      queryFn: () => fetchPart<RunupMonth>(pin, name),
      staleTime: Infinity,
      retry: 1,
    })),
    combine: allMonths,
  });
  const data = useMemo<RunupData | null>(() => {
    const i = index.data;
    if (!i) return null;
    if (i.version !== 2) return fromV1(i);
    return months.data ? assemble(i, months.data) : null;
  }, [index.data, months.data]);
  const plan = { data, isLoading: index.isLoading || months.isLoading, isError: index.isError || months.isError };

  const ticks = usePlanTicks();
  const manifest = useQuery({
    queryKey: ["study-files", pin],
    queryFn: () => fetchStudyManifest(pin),
    staleTime: 5 * 60_000,
  });
  const done = useMemo(() => new Set((ticks.data ?? []).map((t) => t.task_id)), [ticks.data]);
  return { plan, ticks, done, files: manifest.data?.files ?? [] };
}

/** An event's past-paper questions: its own file, loaded with its page, or inline in a plan from before the split. */
export function useEventPyqs(event: RunupEvent | null): { pyqs: RunupPyq[]; isLoading: boolean } {
  const pin = usePin();
  const file = event?.pyqs ? null : (event?.pyqsFile ?? null);
  const q = useQuery({
    queryKey: ["study-part", pin, file],
    queryFn: () => fetchPart<{ pyqs: RunupPyq[] }>(pin, file!),
    enabled: file !== null,
    staleTime: Infinity,
    retry: 1,
  });
  return { pyqs: event?.pyqs ?? q.data?.pyqs ?? [], isLoading: file !== null && q.isLoading };
}
