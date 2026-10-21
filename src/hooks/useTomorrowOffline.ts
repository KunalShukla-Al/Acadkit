import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePin } from "@/hooks/useData";
import { EVENING, mayFetch } from "@/lib/tomorrow";
import { useAppStore } from "@/store/app";

/**
 * Tomorrow offline: from the evening on, while the app is open, keep the
 * next class day's files on this device (src/lib/tomorrowOffline.ts,
 * loaded only then). Checked now, every half hour, and on coming back
 * online; off in Settings.
 */
export function useTomorrowOffline() {
  const pin = usePin();
  const qc = useQueryClient();
  const on = useAppStore((s) => s.tomorrowOffline);
  useEffect(() => {
    if (!on) return;
    const check = () => {
      const connection = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
      if (new Date().getHours() < EVENING || !navigator.onLine || !mayFetch(connection)) return;
      void import("@/lib/tomorrowOffline").then((m) => m.keepTomorrow(pin, qc)).catch(() => {});
    };
    check();
    const t = setInterval(check, 30 * 60_000);
    window.addEventListener("online", check);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", check);
    };
  }, [on, pin, qc]);
}
