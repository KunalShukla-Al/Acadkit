import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Laptop } from "lucide-react";
import { fetchMacJobs } from "@/api/studyFiles";
import { Line } from "@/components/primitives/line";
import { Sheet } from "@/components/primitives/sheet";
import { usePin } from "@/hooks/useData";
import { ago, JOBS, macLine } from "@/lib/macJobs";
import { cn } from "@/lib/utils";

/**
 * Today's last line: how the Mac's jobs are going, in one line (a failure,
 * a Mac that's gone quiet, or that it's keeping up). Tapped, when each job
 * last ran and what it said.
 */
export function MacLine() {
  const pin = usePin();
  const [open, setOpen] = useState(false);
  const { data, dataUpdatedAt } = useQuery({ queryKey: ["mac-jobs", pin], queryFn: () => fetchMacJobs(pin), staleTime: 5 * 60_000, retry: 1 });
  // "4 min ago" as of the fetch, which refreshes with the query.
  const now = dataUpdatedAt;
  const line = macLine(data, now);
  if (!line || !data) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="block w-full rounded-xl px-1 text-left hover:bg-surface-2/60">
        <Line icon={Laptop} value={line.value} tone={line.tone}>
          {line.text}
        </Line>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Your Mac" description="When each job last ran.">
        <ul className="divide-y">
          {JOBS.map(({ name, label }) => {
            const job = data.jobs[name];
            return (
              <li key={name} className="flex items-baseline justify-between gap-3 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{label}</span>
                  {job?.note && <span className={cn("block text-xs", job.ok ? "text-muted" : "text-bad-deep")}>{job.note}</span>}
                </span>
                <span className={cn("tabular shrink-0", job && !job.ok ? "text-bad-deep" : "text-muted")}>
                  {job ? `${job.ok ? "" : "failed "}${ago(now - job.at)}` : "not yet"}
                </span>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
