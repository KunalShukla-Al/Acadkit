import { useEffect } from "react";
import { needsNudge, nudgeViewport } from "@/lib/viewportNudge";

/**
 * Puts the tab bar on the bottom edge in the installed iPhone app: once
 * the shell is on screen, and each time the app comes back to the front.
 * See viewportNudge.ts for why.
 */
export function useViewportNudge() {
  useEffect(() => {
    if (!needsNudge()) return;
    let frame = 0;
    const nudge = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => nudgeViewport());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") nudge();
    };
    nudge();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", nudge);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", nudge);
    };
  }, []);
}
