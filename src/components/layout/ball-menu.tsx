import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, CalendarX2, History, Layers, Settings, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const WaitingBadge = lazy(() => import("@/components/flashcards/waiting-badge").then((m) => ({ default: m.WaitingBadge })));

const SIZE = 56;
const STICKER = 68;
/** Clear of the top bar above and the tab bar below, and how far the stickers reach above and below the ball, labels included. */
const TOP = 72;
const REACH_UP = 270;
const REACH_DOWN = 70;

interface Item {
  label: string;
  icon: LucideIcon;
  /** Where it goes; none opens the flashcards. */
  to?: string;
  badge?: boolean;
  tone: keyof typeof TONES;
  /** Where its sticker lands from a ball on the right edge, and its tilt; the left edge mirrors it. */
  at: [dx: number, dy: number, tilt: number];
}

const TONES = {
  lime: "bg-brand text-brand-ink",
  coral: "bg-accent-2 text-brand-ink",
  ink: "bg-ink text-bg",
};

/** What the ball holds: the pages used now and then, as a cluster of stickers beside it. */
const ITEMS: Item[] = [
  { label: "Calendar", icon: CalendarDays, to: "/calendar", tone: "lime", at: [-106, -230, -8] },
  { label: "Skips", icon: CalendarX2, to: "/skips", tone: "coral", at: [-210, -160, 7] },
  { label: "Flashcards", icon: Layers, badge: true, tone: "ink", at: [-80, -108, -4] },
  { label: "History", icon: History, to: "/history", tone: "lime", at: [-238, -40, 9] },
  { label: "Settings", icon: Settings, to: "/settings", tone: "coral", at: [-134, 8, -6] },
];

/**
 * The ball, open: it spins into a close button where it stood, and the
 * stickers burst out of it. `x` and `y` are the ball's centre; `onPick`
 * gets an item's page, or nothing for the flashcards.
 */
export default function BallMenu({
  open,
  x,
  y,
  side,
  onClose,
  onPick,
}: {
  open: boolean;
  x: number;
  y: number;
  side: "left" | "right";
  onClose: () => void;
  onPick: (to: string | undefined) => void;
}) {
  // The cluster keeps clear of the bars: a ball high up drops it, one low down lifts it.
  const mirror = side === "right" ? 1 : -1;
  const anchorY = Math.min(Math.max(y, TOP + REACH_UP), window.innerHeight - 80 - REACH_DOWN);
  const spot = ({ at: [dx, dy, tilt] }: Item) => ({ x: x + dx * mirror, y: anchorY + dy, tilt: tilt * mirror });

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="menu"
          role="dialog"
          aria-modal="true"
          aria-label="More"
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Tapping anywhere else closes it too; the keyboard has the close button and Escape. */}
          <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 bg-bg/95" onClick={onClose} />

          <motion.button
            type="button"
            aria-label="Close"
            autoFocus
            onClick={onClose}
            initial={{ rotate: -135, scale: 0.9 }}
            animate={{ rotate: 0, scale: 1 }}
            exit={{ rotate: -135, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className="absolute flex items-center justify-center rounded-full bg-brand text-brand-ink ring-4 ring-bg"
            style={{ left: x - SIZE / 2, top: y - SIZE / 2, width: SIZE, height: SIZE }}
          >
            <X className="h-7 w-7" strokeWidth={2.6} />
          </motion.button>

          {ITEMS.map((item, i) => {
            const at = spot(item);
            const from = { left: x - 48, top: y - STICKER / 2, opacity: 0, scale: 0.2 };
            return (
              <motion.button
                key={item.label}
                type="button"
                onClick={() => onPick(item.to)}
                initial={from}
                animate={{ left: at.x - 48, top: at.y - STICKER / 2, opacity: 1, scale: 1 }}
                exit={{ ...from, transition: { duration: 0.18, delay: (ITEMS.length - 1 - i) * 0.02 } }}
                transition={{ type: "spring", stiffness: 380, damping: 17, delay: 0.04 + i * 0.045 }}
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                className="group absolute flex w-24 flex-col items-center gap-2.5 outline-none"
              >
                <motion.span
                  initial={{ rotate: 0 }}
                  animate={{ rotate: at.tilt }}
                  transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.08 + i * 0.045 }}
                  className={cn(
                    "relative flex items-center justify-center rounded-[22px] ring-accent/60 ring-offset-2 ring-offset-bg group-focus-visible:ring-4",
                    TONES[item.tone]
                  )}
                  style={{ width: STICKER, height: STICKER }}
                >
                  <item.icon className="h-7 w-7" strokeWidth={2.2} />
                  {item.badge && (
                    <Suspense fallback={null}>
                      <WaitingBadge />
                    </Suspense>
                  )}
                </motion.span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-ink">{item.label}</span>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
