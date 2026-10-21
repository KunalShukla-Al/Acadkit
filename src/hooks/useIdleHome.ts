import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

/** How long the app can sit in the background before it reopens on Today. */
export const IDLE_HOME_MS = 150_000;

/** Whether coming back after `hiddenAt` should land on Today rather than where you left off. */
export function shouldGoHome(hiddenAt: number | null, now: number, path: string, limit = IDLE_HOME_MS): boolean {
  return hiddenAt !== null && now - hiddenAt >= limit && path !== "/";
}

/**
 * Back on Today after the app has been in the background for a while (another app, the phone locked).
 * Opening AcadKit later should show today's picture, not the page a quick check ended on. A short trip
 * away - answering a message - keeps your place. The page you left stays one Back away.
 */
export function useIdleHome(limit = IDLE_HOME_MS) {
  const navigate = useNavigate();
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (shouldGoHome(hiddenAt.current, Date.now(), window.location.pathname, limit)) {
        navigate("/");
        window.scrollTo(0, 0);
      }
      hiddenAt.current = null;
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [navigate, limit]);
}
