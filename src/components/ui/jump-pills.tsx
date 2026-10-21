import { useEffect, useRef } from "react";
import { jumpTargetId } from "@/lib/jump";
import { cn } from "@/lib/utils";

export interface JumpPill {
  id: string;
  label: string;
  /** The subject's colour, as a dot before the label. */
  color?: string;
  /** A small figure after the label ("82%", "A+"), coloured by `detailClass`. */
  detail?: string | null;
  detailClass?: string;
}

/**
 * A row of subject chips under a page's headline figure: tap one to scroll straight to that subject's
 * card (and `onJump` can open it) instead of scrolling past everything above it.
 *
 * The chips wrap into a grid, so nothing scrolls sideways inside the views you swipe between.
 */
export function JumpPills({
  pills,
  prefix,
  onJump,
  className,
}: {
  pills: JumpPill[];
  prefix: string;
  onJump?: (id: string) => void;
  className?: string;
}) {
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  if (pills.length < 2) return null;

  const jump = (id: string) => {
    onJump?.(id);
    // After the card has had a frame to open, so it lands where it ends up.
    requestAnimationFrame(() => {
      const el = document.getElementById(jumpTargetId(prefix, id));
      if (!el) return;
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      el.setAttribute("data-jumped", "");
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => el.removeAttribute("data-jumped"), 1400);
    });
  };

  // Every chip on screen at once, two or three to a row: a sideways-scrolling row hid the subjects past
  // the edge, and its 32px chips were small to hit.
  const cols = pills.length === 2 || pills.length === 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <nav aria-label="Jump to a subject" className={cn("w-full", className)}>
      <ul className={cn("grid gap-2", cols)}>
        {pills.map((p) => (
          <li key={p.id} className="min-w-0">
            <button
              type="button"
              onClick={() => jump(p.id)}
              className="flex h-11 w-full min-w-0 items-center justify-center gap-1 rounded-full border bg-surface px-1.5 text-sm font-bold transition-colors hover:bg-surface-2 active:scale-95"
            >
              {p.color && (
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
              )}
              <span className="truncate">{p.label}</span>
              {/* Same size and face as the label, so it reads as part of the same word. */}
              {p.detail && <span className={cn("shrink-0", p.detailClass ?? "text-muted")}>{p.detail}</span>}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
