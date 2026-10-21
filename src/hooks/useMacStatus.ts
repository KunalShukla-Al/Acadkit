import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePin } from "@/hooks/useData";
import { macState, type MacState } from "@/lib/mac";

/**
 * Whether the Mac is awake, syncing or asleep, live: it tracks Presence on
 * its private channel, mac:<pin> (scripts/mac/link.mjs, migration 055).
 * Null until the channel is joined, and when it can't be.
 */
export function useMacStatus(): MacState | null {
  const pin = usePin();
  const [state, setState] = useState<MacState | null>(null);
  useEffect(() => {
    const channel = supabase.channel(`mac:${pin}`, { config: { private: true } });
    channel
      .on("presence", { event: "sync" }, () => setState(macState(channel.presenceState())))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setState(null);
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pin]);
  return state;
}
