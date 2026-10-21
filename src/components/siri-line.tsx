import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { fetchSiriMarks, undoSiriMark } from "@/api/siri";
import { broadcastInvalidate } from "@/lib/broadcast";
import { subjectShort } from "@acadkit/core/subjectShort";
import { useAttendance, usePin, useSubjects } from "@/hooks/useData";

/** "Siri marked you absent in OS · 2 classes · 9:12 AM" (or "Left SRM early…"), with Undo, for a day after (migration 051). */
export function SiriLine() {
  const pin = usePin();
  const qc = useQueryClient();
  const marks = useQuery({ queryKey: ["siri-marks", pin], queryFn: () => fetchSiriMarks(pin), staleTime: 30_000 });
  const { data: subjects } = useSubjects();
  const { data: attendance } = useAttendance();
  const undo = useMutation({
    mutationFn: (i: number) => undoSiriMark(pin, marks.data![i], attendance ?? []),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["siri-marks", pin] });
      void qc.invalidateQueries({ queryKey: ["attendance", pin] });
      broadcastInvalidate(["attendance"]);
      toast.success("Put back as it was");
    },
    onError: () => toast.error("Couldn't undo it. Check your connection and try again."),
  });

  const latest = marks.data?.[0];
  if (!latest || !latest.rows.length) return null;
  const names = [...new Set(latest.rows.map((r) => subjects?.find((s) => s.id === r.subject_id)).filter(Boolean).map((s) => subjectShort(s!)))];
  const n = latest.rows.length;
  const at = new Date(latest.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  return (
    <section className="card flex items-center gap-3 px-4 py-3" role="status">
      <Mic className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">
          {latest.said.startsWith("Left SRM") ? "Left SRM early, marked absent" : "Siri marked you absent"}
          {names.length ? ` in ${names.join(", ")}` : ""}
        </span>
        <span className="text-muted">
          {" "}
          · {n} class{n === 1 ? "" : "es"} · {at}
        </span>
      </p>
      <button
        type="button"
        onClick={() => undo.mutate(0)}
        disabled={undo.isPending}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-accent-deep disabled:opacity-50"
      >
        <Undo2 className="h-4 w-4" /> Undo
      </button>
    </section>
  );
}
