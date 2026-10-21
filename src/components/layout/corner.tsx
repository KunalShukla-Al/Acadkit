import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useToday } from "@/hooks/useToday";
import { CORNER, CornerMark } from "@/components/layout/corner-mark";
import { cn, haptic } from "@/lib/utils";

// The open menu and the deck load on their own; a finger on the corner starts the menu's download.
const loadMenu = () => import("@/components/layout/corner-menu");
const CornerMenu = lazy(loadMenu);
const FlashcardDeck = lazy(() => import("@/components/flashcards/flashcard-deck").then((m) => ({ default: m.FlashcardDeck })));

/**
 * The corner: a lime quarter-disc fixed in the bottom-right corner, above
 * the tab bar on a phone (`--nav-h`, which the bar keeps), carrying
 * today's Day Order (a star on a day without classes). Tapped, the pages
 * used now and then, Calendar, Skips, Flashcards, History and Settings,
 * burst out of it as tilted stickers (`corner-menu.tsx`), and it turns
 * into their close button.
 */
export function Corner() {
  const navigate = useNavigate();
  const { today } = useToday();
  const dayOrder = today.kind === "working" ? today.dayOrder : null;
  const [open, setOpen] = useState(false);
  // Mounted from the first open on, so closing can play out.
  const [menu, setMenu] = useState(false);
  const [deck, setDeck] = useState(false);
  const corner = useRef<HTMLButtonElement>(null);

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

  return (
    <>
      <button
        ref={corner}
        type="button"
        aria-label={`${dayOrder ? `Day Order ${dayOrder}. ` : ""}More: calendar, skips, flashcards, history and settings`}
        aria-haspopup="dialog"
        aria-expanded={open}
        // While the menu is open its own close button sits exactly here.
        aria-hidden={open || undefined}
        tabIndex={open ? -1 : undefined}
        onPointerDown={() => void loadMenu()}
        onClick={() => {
          haptic();
          setMenu(true);
          setOpen(true);
        }}
        style={{ width: CORNER, height: CORNER, bottom: "var(--nav-h, 0px)" }}
        className={cn(
          "fixed right-0 z-40 rounded-tl-full bg-brand text-brand-ink transition-[transform,opacity] active:scale-95",
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
              if (to) navigate(to);
              else setDeck(true);
            }}
          />
        </Suspense>
      )}

      {deck && (
        <Suspense fallback={null}>
          <FlashcardDeck
            onClose={() => {
              setDeck(false);
              corner.current?.focus();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
