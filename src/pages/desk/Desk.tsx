import { Suspense } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { DeskLoading } from "@/components/desk/states";
import { Segmented } from "@/components/ui/segmented";

type Screen = "today" | "priorities" | "practice";

const SCREENS: { value: Screen; label: string; to: string }[] = [
  { value: "today", label: "Today", to: "/desk" },
  { value: "priorities", label: "Priorities", to: "/desk/priorities" },
  { value: "practice", label: "Practice", to: "/desk/practice" },
];

/** The screen a Desk path shows: a day or an event is Today's. */
function deskScreen(pathname: string): Screen {
  if (pathname.startsWith("/desk/priorities")) return "priorities";
  if (pathname.startsWith("/desk/practice")) return "practice";
  return "today";
}

/**
 * The Desk (docs/desk.md): Today's plan, the Priorities for each test and
 * unit, and Practice from every past paper, under one bar.
 */
export default function Desk() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const screen = deskScreen(pathname);
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-1 sm:flex-row sm:items-center">
        {/* Today's day and an event's page carry their own heading. */}
        {screen !== "today" && <h1 className="text-2xl font-extrabold tracking-tight lg:text-3xl">Desk</h1>}
        <Segmented
          options={SCREENS}
          value={screen}
          onChange={(v) => navigate(SCREENS.find((s) => s.value === v)!.to)}
          layoutId="desk-screen"
          size="sm"
          className="sm:ml-auto sm:w-96"
        />
      </div>
      <Suspense fallback={<DeskLoading />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
