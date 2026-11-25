import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { resetAfterSignOut } from "@/lib/accountReset";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/store/app";

export { RQ_CACHE_KEY } from "@/lib/accountReset";

/** Wipe everything the previous account left behind when a session ends (src/lib/accountReset.ts). */
export function useAuthReset(): void {
  const qc = useQueryClient();
  const resetPin = useAppStore((s) => s.resetPin);
  const setName = useAppStore((s) => s.setName);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_OUT") return;
      void resetAfterSignOut(qc);
      resetPin();
      setName("");
    });
    return () => sub.subscription.unsubscribe();
  }, [qc, resetPin, setName]);
}
