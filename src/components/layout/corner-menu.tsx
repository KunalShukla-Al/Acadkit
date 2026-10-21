import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { CalendarDays, CalendarX2, History, Layers, Settings, X, type LucideIcon } from "lucide-react";
import { CORNER, CornerMark } from "@/components/layout/corner-mark";
import { cn } from "@/lib/utils";

const WaitingBadge = lazy(() => import("@/components/flashcards/waiting-badge").then((m) => ({ default: m.WaitingBadge })));

const STICKER = 68;
/** Clear of the top bar above, and how far the stickers reach above and below their anchor, labels included. */
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
  /** Where its sticker lands from the anchor, and its tilt. */
  at: [dx: number, dy: number, tilt: number];
}

const TONES = {
  lime: "bg-brand text-brand-ink",
  coral: "bg-accent-2 text-brand-ink",
  ink: "bg-ink text-bg",
};

/** What the corner holds: the pages used now and then, as a cluster of stickers beside it. */
const ITEMS: Item[] = [
  { label: "Calendar", icon: CalendarDays, to: "/calendar", tone: "lime", at: [-106, -230, -8] },
  { label: "Skips", icon: CalendarX2, to: "/skips", tone: "coral", at: [-210, -160, 7] },
  { label: "Flashcards", icon: Layers, badge: true, tone: "ink", at: [-80, -108, -4] },
  { label: "History", icon: History, to: "/history", tone: "lime", at: [-238, -40, 9] },
  { label: "Settings", icon: Settings, to: "/settings", tone: "coral", at: [-134, 8, -6] },
];

/** The tab bar's height, which it keeps in --nav-h; 0 where there's no bar. */
function navHeight(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 0;
}

interface Props {
  onClose: () => void;
  onPick: (to: string | undefined) => void;
}

/**
 * The corner, open: the stickers burst out of it, and the corner turns
 * into its close button. `onPick` gets an item's page, or nothing for the
 * flashcards.
 */
export default function CornerMenu({ open, ...props }: Props & { open: boolean }) {
  return createPortal(<AnimatePresence>{open && <Burst key="menu" {...props} />}</AnimatePresence>, document.body);
}

function Burst({ onClose, onPick }: Props) {
  // Closing, it lets taps through to the page and the corner underneath.
  const present = useIsPresent();
  const bottom = window.innerHeight - navHeight();
  // The corner's own middle, where the stickers start from.
  const origin = { x: window.innerWidth - CORNER / 3, y: bottom - CORNER / 3 };
  // The cluster hangs off a point on the right just above the tab bar, kept clear of the bars.
  const anchor = { x: window.innerWidth - 34, y: Math.min(Math.max(window.innerHeight - 152, TOP + REACH_UP), window.innerHeight - 80 - REACH_DOWN) };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="More"
      className={cn("fixed inset-0 z-50", !present && "pointer-events-none")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Tapping anywhere else closes it too; the keyboard has the close button and Escape. */}
      <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 bg-bg/95" onClick={onClose} />

      {ITEMS.map((item, i) => {
        const [dx, dy, tilt] = item.at;
        const from = { left: origin.x - 48, top: origin.y - STICKER / 2, opacity: 0, scale: 0.2 };
        return (
          <motion.button
            key={item.label}
            type="button"
            onClick={() => onPick(item.to)}
            initial={from}
            animate={{ left: anchor.x + dx - 48, top: anchor.y + dy - STICKER / 2, opacity: 1, scale: 1 }}
            exit={{ ...from, transition: { duration: 0.18, delay: (ITEMS.length - 1 - i) * 0.02 } }}
            transition={{ type: "spring", stiffness: 380, damping: 17, delay: 0.04 + i * 0.045 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            className="group absolute flex w-24 flex-col items-center gap-2.5 outline-none"
          >
            <motion.span
              initial={{ rotate: 0 }}
              animate={{ rotate: tilt }}
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

      {/* The corner, turned into the close button where it sits, over the stickers until they fly out. */}
      <button
        type="button"
        aria-label="Close"
        autoFocus
        onClick={onClose}
        className="absolute right-0 rounded-tl-full bg-brand text-brand-ink"
        style={{ width: CORNER, height: CORNER, bottom: "var(--nav-h, 0px)" }}
      >
        <CornerMark>
          <motion.span
            className="block"
            initial={{ rotate: -90, scale: 0.4 }}
            animate={{ rotate: 0, scale: 1 }}
            exit={{ rotate: -90, scale: 0.4 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <X className="h-6 w-6" strokeWidth={2.8} />
          </motion.span>
        </CornerMark>
      </button>
    </motion.div>
  );
}
