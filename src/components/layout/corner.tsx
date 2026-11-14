import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Star } from "lucide-react";
import { useToday } from "@/hooks/useToday";
import { CORNER, CornerMark } from "@/components/layout/corner-mark";
import { cn, haptic } from "@/lib/utils";

// The menu and the calendar load on their own; a finger on the corner starts both downloads.
const loadMenu = () => import("@/components/layout/corner-menu");
const loadCalendar = () => import("@/pages/Calendar");
const CornerMenu = lazy(loadMenu);

/** What the More buttons send the corner, which owns the menu. */
const OPEN_MORE = "acadkit:open-more";

/** How long a press on the corner is held before it opens the menu instead of the calendar. */
const HOLD_MS = 450;

/**
 * The corner: a lime quarter-disc fixed in the bottom-right corner, above
 * the tab bar on a phone (`--nav-h`, which the bar keeps), carrying
 * today's Day Order (a star on a day without classes). A tap opens the
 * calendar, the page I open most. Held, or from a More button, the pages
 * used now and then (Skips, History, Settings) burst out of it as tilted
 * stickers (`corner-menu.tsx`), and it turns into their close button.
 */
export function Corner() {
  const navigate = useNavigate();
  const { today } = useToday();
  const dayOrder = today.kind === "working" ? today.dayOrder : null;
  const [open, setOpen] = useState(false);
  // Mounted from the first open on, so closing can play out.
  const [menu, setMenu] = useState(false);
  const corner = useRef<HTMLButtonElement>(null);
  const hold = useRef<number | undefined>(undefined);
  // Set when a hold opened the menu, so the click that ends the press doesn't also open the calendar.
  const held = useRef(false);

  function openMenu() {
    haptic();
    setMenu(true);
    setOpen(true);
  }

  useEffect(() => {
    window.addEventListener(OPEN_MORE, openMenu);
    return () => window.removeEventListener(OPEN_MORE, openMenu);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      corner.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const release = () => window.clearTimeout(hold.current);

  return (
    <>
      <button
        ref={corner}
        type="button"
        aria-label={`${dayOrder ? `Day Order ${dayOrder}. ` : ""}Calendar. Hold for skips, history and settings`}
        // While the menu is open its own close button sits exactly here.
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
        onPointerDown={() => {
          void loadCalendar();
          void loadMenu();
          held.current = false;
          release();
          hold.current = window.setTimeout(() => {
            held.current = true;
            openMenu();
          }, HOLD_MS);
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(e) => {
          e.preventDefault();
          release();
          if (!held.current) openMenu();
          held.current = true;
        }}
        onClick={() => {
          if (held.current) {
            held.current = false;
            return;
          }
          haptic();
          navigate("/calendar");
        }}
        style={{ width: CORNER, height: CORNER, bottom: "var(--nav-h, 0px)" }}
        className={cn(
          "fixed right-0 z-40 touch-manipulation select-none rounded-tl-full bg-brand text-brand-ink transition-[transform,opacity] [-webkit-touch-callout:none] active:scale-95",
          open && "pointer-events-none opacity-0"
        )}
      >
        <CornerMark>
          {dayOrder ? (
            <span className="font-display text-[26px] font-bold leading-none tabular">{dayOrder}</span>
          ) : (
            <Star className="h-5 w-5" strokeWidth={2.4} fill="currentColor" />
          )}
        </CornerMark>
      </button>

      {menu && (
        <Suspense fallback={null}>
          <CornerMenu
            open={open}
            onClose={() => {
              setOpen(false);
              corner.current?.focus();
            }}
            onPick={(to) => {
              haptic();
              setOpen(false);
              navigate(to);
            }}
          />
        </Suspense>
      )}
    </>
  );
}

/** Opens the corner's menu from the top bar (a phone) or the sidebar (the Mac), for a tap or a keyboard. */
export function MoreButton({ wide = false }: { wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label="More: skips, history and settings"
      onPointerDown={() => void loadMenu()}
      onClick={() => window.dispatchEvent(new Event(OPEN_MORE))}
      className={cn(
        "flex items-center gap-2 rounded-2xl bg-surface-2/70 text-sm font-bold text-ink transition-colors hover:bg-surface-2",
        wide ? "w-full px-3.5 py-2.5" : "px-2.5 py-2"
      )}
    >
      <MoreHorizontal className="h-5 w-5 shrink-0" strokeWidth={2.2} />
      {wide && <span className="flex-1 text-left">More</span>}
    </button>
  );
}
