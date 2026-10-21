import { lazy, Suspense, useEffect, useRef, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useToday } from "@/hooks/useToday";
import { cn, haptic } from "@/lib/utils";

// The open menu and the deck load on their own; a finger on the ball starts the menu's download.
const loadMenu = () => import("@/components/layout/ball-menu");
const BallMenu = lazy(loadMenu);
const FlashcardDeck = lazy(() => import("@/components/flashcards/flashcard-deck").then((m) => ({ default: m.FlashcardDeck })));

const KEY = "acadkit:ball";
const SIZE = 56;
/** Clear of the top bar above and the tab bar below. */
const TOP = 72;
const BOTTOM = 112;

type Side = "left" | "right";
interface Place {
  side: Side;
  y: number;
}

function savedPlace(): Place {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "null") as Place | null;
    if (p && (p.side === "left" || p.side === "right") && typeof p.y === "number") return p;
  } catch {
    /* private mode, or a value from before */
  }
  // Low on the right, just above the tab bar, where a thumb rests and the least is underneath.
  return { side: "right", y: window.innerHeight - BOTTOM - SIZE / 2 - 12 };
}

const clampY = (y: number) => Math.min(Math.max(y, TOP + SIZE / 2), window.innerHeight - BOTTOM - SIZE / 2);

/**
 * The ball: a lime disc on the screen's edge, like the iPhone's
 * AssistiveTouch, carrying today's Day Order (a star on a day without
 * classes). Tapped, it spins into a close button and the pages used
 * now and then (Calendar, Skips, Flashcards, History, Settings) burst out
 * of it as tilted stickers (`ball-menu.tsx`). Drag it up or down, or
 * across to the other edge; it remembers where it was left.
 */
export function Ball() {
  const navigate = useNavigate();
  const { today } = useToday();
  const dayOrder = today.kind === "working" ? today.dayOrder : null;
  const [place, setPlace] = useState<Place>(savedPlace);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [open, setOpen] = useState(false);
  // Mounted from the first open on, so closing can play out.
  const [menu, setMenu] = useState(false);
  const [deck, setDeck] = useState(false);
  const start = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  // A drag ends in a click too; that click mustn't open the menu.
  const dragged = useRef(false);
  const ball = useRef<HTMLButtonElement>(null);

  // Its spot is worked out from the window's size.
  const [, setSize] = useState(0);
  useEffect(() => {
    const onResize = () => setSize(window.innerWidth * 10_000 + window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const y = clampY(place.y);
  const x = place.side === "right" ? window.innerWidth - SIZE / 2 - 6 : SIZE / 2 + 6;

  const onDown = (e: PointerEvent<HTMLButtonElement>) => {
    void loadMenu();
    start.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 8) return;
    s.moved = true;
    setDrag({ x: e.clientX, y: e.clientY });
  };
  const onUp = (e: PointerEvent<HTMLButtonElement>) => {
    const s = start.current;
    start.current = null;
    setDrag(null);
    if (!s?.moved) return;
    dragged.current = true;
    const next: Place = { side: e.clientX < window.innerWidth / 2 ? "left" : "right", y: clampY(e.clientY) };
    setPlace(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* it stays put for this visit */
    }
  };

  function close() {
    setOpen(false);
    ball.current?.focus();
  }

  return (
    <>
      <button
        ref={ball}
        type="button"
        aria-label={`${dayOrder ? `Day Order ${dayOrder}. ` : ""}More: calendar, skips, flashcards, history and settings`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          haptic();
          setMenu(true);
          setOpen(true);
        }}
        style={{
          left: (drag?.x ?? x) - SIZE / 2,
          top: (drag?.y ?? y) - SIZE / 2,
          width: SIZE,
          height: SIZE,
          transition: drag ? "none" : "left 0.25s ease, top 0.25s ease, opacity 0.2s",
        }}
        className={cn(
          "fixed z-40 flex touch-none items-center justify-center rounded-full bg-brand text-brand-ink ring-4 ring-bg transition-[opacity,transform] active:scale-95",
          open ? "opacity-0" : drag ? "scale-105 opacity-100" : "opacity-90 hover:opacity-100 focus-visible:opacity-100"
        )}
      >
        {dayOrder ? (
          <span aria-hidden className="font-display text-[30px] font-bold leading-none tabular">
            {dayOrder}
          </span>
        ) : (
          <Star aria-hidden className="h-6 w-6" strokeWidth={2.4} fill="currentColor" />
        )}
      </button>

      {menu && (
        <Suspense fallback={null}>
          <BallMenu
            open={open}
            x={x}
            y={y}
            side={place.side}
            onClose={close}
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
              ball.current?.focus();
            }}
          />
        </Suspense>
      )}
    </>
  );
}
