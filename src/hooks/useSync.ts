import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { onBroadcastInvalidate } from "@/lib/broadcast";
import { usePin } from "@/hooks/useData";

const TABLE_TO_KEY: Record<string, string> = {
  settings: "settings",
  subjects: "subjects",
  timetable_slots: "timetable",
  attendance: "attendance",
  marks: "marks",
  deadlines: "deadlines",
  // the sync bookmarklet writes here; a change pushes it straight into the UI
  portal_snapshots: "portal_snapshots",
  portal_snapshot_history: "snapshot_history",
  // the study-folder sync writes here (migration 026)
  suggestions: "suggestions",
  // run-up ticks (migration 043): ticked on the phone, shown on the Mac
  plan_ticks: "plan-ticks",
  // where you're reading (migration 062), for Continue on the other device
  reading_now: "reading",
};

/**
 * Keeps this client fresh from two directions:
 *  - BroadcastChannel: other tabs of the same origin
 *  - Supabase Realtime Broadcast: a "change" on the private channel
 *    pin:<pin> for each write to a table above, from any device or the Mac
 *    (migration 056)
 */
export function useSync() {
  const pin = usePin();
  const qc = useQueryClient();

  useEffect(() => {
    return onBroadcastInvalidate((keys) => {
      for (const key of keys) void qc.invalidateQueries({ queryKey: [key, pin] });
    });
  }, [qc, pin]);

  useEffect(() => {
    const channel = supabase.channel(`pin:${pin}`, { config: { private: true } });
    channel.on("broadcast", { event: "change" }, ({ payload }) => {
      const key = TABLE_TO_KEY[(payload as { table?: string }).table ?? ""];
      if (key) void qc.invalidateQueries({ queryKey: [key, pin] });
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, pin]);

  // On reconnect, say what's about to sync.
  useEffect(() => {
    const onOnline = () => {
      const paused = qc.getMutationCache().getAll().filter((m) => m.state.isPaused).length;
      if (paused > 0)
        toast.success(`Back online - syncing ${paused} offline change${paused > 1 ? "s" : ""}`);
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [qc]);
}
