import { Link, useLocation } from "react-router-dom";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The calendar from anywhere: an icon in the phone's top bar, left of the
 * Run-up, and a row in the Mac's sidebar. I open it most days, so it sits
 * one tap away here rather than inside the corner menu.
 */
export function CalendarButton({ wide = false }: { wide?: boolean }) {
  const { pathname } = useLocation();
  const active = pathname === "/calendar" || pathname.startsWith("/calendar/");
  return (
    <Link
      to="/calendar"
      aria-current={active ? "page" : undefined}
      aria-label="Calendar"
      className={cn(
        "flex items-center gap-2 rounded-2xl text-sm font-bold transition-colors",
        wide ? "w-full px-3.5 py-2.5" : "px-2.5 py-2",
        active ? "bg-brand text-brand-ink" : "bg-surface-2/70 text-ink hover:bg-surface-2"
      )}
    >
      <Calendar className="h-5 w-5 shrink-0" strokeWidth={2.2} />
      {wide && <span className="flex-1">Calendar</span>}
    </Link>
  );
}
