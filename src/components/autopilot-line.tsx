import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScanText, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { fetchAutopilotActions, undoAutopilotAction, type AutopilotAction } from "@/api/autopilot";
import { broadcastInvalidate } from "@/lib/broadcast";
import { usePin } from "@/hooks/useData";

/**
 * "Added OS FT-II (Thu, 29 Oct) · from notice.jpg", or what a portal
 * screenshot changed, with Undo, for three days after (migrations 053, 059).
 */
export function AutopilotLine() {
  const pin = usePin();
  const qc = useQueryClient();
  const actions = useQuery({ queryKey: ["autopilot-actions", pin], queryFn: () => fetchAutopilotActions(pin), staleTime: 30_000 });
  const undo = useMutation({
    mutationFn: (action: AutopilotAction) => undoAutopilotAction(pin, action),
    onSuccess: (_done, action) => {
      const keys = action.kind === "portal" ? ["portal_snapshots", "snapshot_history", "marks"] : ["deadlines"];
      void qc.invalidateQueries({ queryKey: ["autopilot-actions", pin] });
      for (const key of keys) void qc.invalidateQueries({ queryKey: [key, pin] });
      broadcastInvalidate(keys);
      toast.success(action.kind === "portal" ? "Put back as it was" : "Taken off your list");
    },
    onError: () => toast.error("Couldn't undo it. Check your connection and try again."),
  });

  const latest = actions.data?.[0];
  if (!latest) return null;
  return (
    <section className="card flex items-center gap-3 px-4 py-3" role="status">
      <ScanText className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{latest.said.replace(/\.$/, "")}</span>
        <span className="text-muted"> · from {latest.source.split("/").pop()}</span>
      </p>
      <button
        type="button"
        onClick={() => undo.mutate(latest)}
        disabled={undo.isPending}
        className="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold text-accent-deep disabled:opacity-50"
      >
        <Undo2 className="h-4 w-4" /> Undo
      </button>
    </section>
  );
}
