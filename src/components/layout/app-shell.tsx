import { lazy, Suspense } from "react";
import { Link, Navigate, useLocation, useOutlet } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Corner } from "@/components/layout/corner";
import { BottomNav } from "@/components/layout/bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { Skeleton } from "@/components/ui/misc";
import { useSync } from "@/hooks/useSync";
import { useAutoMarkRunner } from "@/hooks/useAutoMark";
import { useThemeSync } from "@/hooks/useThemeSync";
import { useScrollReset } from "@/hooks/useScrollReset";
import { useFreeDayWatch } from "@/hooks/useFreeDayWatch";
import { useForecastLog } from "@/hooks/useForecastLog";
import { useActiveDay } from "@/hooks/useActiveDay";
import { usePushKeyMove } from "@/hooks/usePush";
import { useTomorrowOffline } from "@/hooks/useTomorrowOffline";
import { movedTo } from "@/lib/screens";

// The chip reads the whole run-up plan, so it loads on its own, just after the page.
const RunupChip = lazy(() => import("@/components/layout/runup-chip").then((m) => ({ default: m.RunupChip })));

function PageFallback() {
  return (
    <div className="space-y-4 pt-2">
      <Skeleton className="h-9 w-44" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-28 w-full" />
    </div>
  );
}

/**
 * Every signed-in page sits in this: the sidebar on a Mac; on a phone the
 * name and the Run-up above, the five tabs below, and the corner on top
 * of them. A new page simply replaces the last; things move only when
 * something on the page changes.
 */
export function AppShell() {
  useSync();
  useAutoMarkRunner();
  useThemeSync();
  useScrollReset();
  useFreeDayWatch();
  useForecastLog();
  useActiveDay();
  usePushKeyMove();
  useTomorrowOffline();
  const location = useLocation();
  const outlet = useOutlet();

  // A link to a page that moved into a screen (a notification, a bookmark) lands on its screen and tab.
  const moved = movedTo(location.pathname, location.search, location.hash);
  if (moved) return <Navigate to={moved} replace />;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <Sidebar />

      <div className="flex min-w-0 flex-col">
        {/* The phone's top bar: the name and the Run-up; the five tabs are below. */}
        <header className="glass sticky top-0 z-30 border-b pt-safe-t lg:hidden">
          <div className="flex items-center justify-between px-4 py-2">
            <Link to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-brand-ink">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-[17px] font-extrabold tracking-tight">AcadKit</span>
            </Link>
            <Suspense fallback={null}>
              <RunupChip />
            </Suspense>
          </div>
        </header>

        <OfflineBanner />

        <main className="relative mx-auto w-full max-w-5xl flex-1 px-4 pb-32 pt-4 lg:px-10 lg:pb-16 lg:pt-8">
          <Suspense fallback={<PageFallback />}>{outlet}</Suspense>
        </main>

        <BottomNav />
      </div>

      <Corner />
    </div>
  );
}
