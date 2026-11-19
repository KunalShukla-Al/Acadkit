import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { CalendarX2, ChevronRight, History, Settings, X, type LucideIcon } from "lucide-react";
import { CORNER, CornerMark } from "@/components/layout/corner-mark";
import { cn } from "@/lib/utils";

interface Item {
  label: string;
  icon: LucideIcon;
  to: string;
}

/** What the corner holds: the pages used now and then. */
const ITEMS: Item[] = [
  { label: "Skips", icon: CalendarX2, to: "/skips" },
  { label: "History", icon: History, to: "/history" },
  { label: "Settings", icon: Settings, to: "/settings" },
];

/** The panel's gap from the screen edge and from the corner below it. */
const EDGE = 12;
const SPRING = { type: "spring", stiffness: 520, damping: 36 } as const;

interface Props {
  onClose: () => void;
  onPick: (to: string) => void;
}

/**
 * The corner, open: it grows into a card of the pages it holds, one row
 * each, and turns into its own close button. `onPick` gets a row's page.
 */
export default function CornerMenu({ open, ...props }: Props & { open: boolean }) {
  return createPortal(<AnimatePresence>{open && <Panel key="menu" {...props} />}</AnimatePresence>, document.body);
}

function Panel({ onClose, onPick }: Props) {
  // Closing, it lets taps through to the page and the corner underneath.
  const present = useIsPresent();

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="More"
      className={cn("fixed inset-0 z-50", !present && "pointer-events-none")}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
    >
      {/* Tapping anywhere else closes it too; the keyboard has the close button and Escape. */}
      <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 bg-bg/80" onClick={onClose} />

      {/* Grows out of the corner below it, so it reads as the corner opening. */}
      <motion.div
        className="card absolute w-60 p-1.5"
        style={{ right: EDGE, bottom: `calc(var(--nav-h, 0px) + ${CORNER + EDGE / 2}px)`, transformOrigin: "bottom right" }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.12 } }}
        transition={SPRING}
      >
        {ITEMS.map((item, i) => (
          <motion.button
            key={item.label}
            type="button"
            onClick={() => onPick(item.to)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...SPRING, delay: 0.04 + i * 0.03 }}
            whileTap={{ scale: 0.97 }}
            className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left outline-none transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-ink">
              <item.icon className="h-5 w-5" strokeWidth={2.2} />
            </span>
            <span className="flex-1 text-sm font-bold text-ink">{item.label}</span>
            <ChevronRight className="h-4 w-4 text-muted" />
          </motion.button>
        ))}
      </motion.div>

      {/* The corner, turned into the close button where it sits. */}
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
            transition={{ type: "spring", stiffness: 900, damping: 40 }}
          >
            <X className="h-6 w-6" strokeWidth={2.8} />
          </motion.span>
        </CornerMark>
      </button>
    </motion.div>
  );
}
