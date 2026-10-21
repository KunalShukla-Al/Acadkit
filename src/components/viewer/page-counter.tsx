import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { haptic } from "@/lib/utils";
import { parsePage, scrubPage } from "@/lib/pager";
import { goToPage, trackPages, type Pager, type Pages } from "@/components/viewer/page-tracking";

/** Reports the page counter's state for whatever the viewer's scroll box holds; `selector` picks out its pages. */
export function DomPager({
  scroller,
  content,
  selector,
  onPager,
}: {
  scroller: HTMLElement | null;
  content: HTMLElement | null;
  selector: string | null;
  onPager: (p: Pager | null) => void;
}) {
  useEffect(() => {
    if (!scroller || !content) return;
    const pages: Pages = selector ? () => [...content.querySelectorAll<HTMLElement>(selector)] : null;
    const goTo = (n: number) => goToPage(scroller, pages, n);
    const stop = trackPages(scroller, pages, (s) => onPager({ ...s, goTo }), { watch: [content] });
    return () => {
      stop();
      onPager(null);
    };
  }, [scroller, content, selector, onPager]);
  return null;
}

/**
 * "3 / 24", in the viewer's pill. The digits roll like an odometer as you
 * read. Drag sideways on it to flip through the whole file, with the page
 * you'd land on floating above; tap it to type a page and go straight there.
 */
export function PageCounter({ pager }: { pager: Pager }) {
  const { current, total, goTo } = pager;
  const [scrub, setScrub] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const drag = useRef<{ x: number; from: number; moved: boolean; to: number } | null>(null);
  const shown = scrub ?? current;

  function onDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    // A drag here scrubs; it mustn't start a text selection across the page.
    e.preventDefault();
    drag.current = { x: e.clientX, from: current, moved: false, to: current };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 6) return;
    d.moved = true;
    const to = scrubPage(d.from, dx, total, Math.min(window.innerWidth, 520) * 0.8);
    if (to === d.to && scrub !== null) return;
    d.to = to;
    setScrub(to);
    goTo(to);
    haptic(4);
  }
  function onUp(tap: boolean) {
    const d = drag.current;
    drag.current = null;
    setScrub(null);
    if (tap && d && !d.moved) setEditing(true);
  }

  if (editing) return <PageField current={current} total={total} onDone={(n) => (setEditing(false), n && goTo(n))} />;
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => onUp(true)}
        onPointerCancel={() => onUp(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") goTo(current + 1);
          else if (e.key === "ArrowLeft" || e.key === "ArrowUp") goTo(current - 1);
          else if (e.key === "Enter" || e.key === " ") setEditing(true);
          else return;
          e.preventDefault();
        }}
        className="flex h-8 select-none items-center rounded-full px-1 tabular"
        // The drag is the counter's own; it mustn't scroll the page under it.
        style={{ touchAction: "none" }}
        aria-label={`Page ${current} of ${total}. Drag sideways to flip through; tap to go to a page.`}
      >
        <span className="flex text-ink">
          <Rolling value={shown} />
        </span>
        <span className="px-0.5">/</span>
        <span>{total}</span>
      </button>
        {scrub !== null && (
          <span
            className="scrub-pop pointer-events-none absolute bottom-full left-1/2 mb-5 flex w-28 -translate-x-1/2 flex-col items-center gap-1.5 rounded-2xl border bg-surface/95 px-3 py-2.5 shadow-lg backdrop-blur-sm"
            aria-hidden
          >
            <span className="flex text-3xl font-extrabold leading-none text-ink tabular">
              <Rolling value={scrub} />
            </span>
            <span className="text-[11px] font-bold text-muted">of {total}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${(scrub / total) * 100}%` }} />
            </span>
          </span>
        )}
    </span>
  );
}

/** The counter turned into a field: type a page, Enter goes there. */
function PageField({ current, total, onDone }: { current: number; total: number; onDone: (n: number | null) => void }) {
  const done = useRef(false);
  const finish = (n: number | null) => {
    if (done.current) return;
    done.current = true;
    onDone(n);
  };
  return (
    <span className="flex h-8 items-center px-1 tabular">
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        enterKeyHint="go"
        defaultValue={current}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") finish(parsePage(e.currentTarget.value, total));
          else if (e.key === "Escape") finish(null);
        }}
        onBlur={(e) => finish(parsePage(e.currentTarget.value, total))}
        className="w-[4ch] rounded-md bg-surface-2 text-center text-ink outline-none"
        aria-label={`Go to page, 1 to ${total}`}
      />
      <span className="px-0.5">/</span>
      <span>{total}</span>
    </span>
  );
}

/**
 * A number whose changed digits roll up as it grows and down as it shrinks,
 * each in its own column: the old digit slides out as the new one slides in.
 * Plain CSS keyframes (index.css, .roll-*), restarted by keying on the value.
 */
function Rolling({ value }: { value: number }) {
  const [prev, setPrev] = useState(value);
  const [from, setFrom] = useState<number | null>(null);
  if (value !== prev) {
    setFrom(prev);
    setPrev(value);
  }
  const up = from === null || value > from;
  const digits = String(value).split("");
  const old = from === null ? "" : String(from);
  return (
    // Flex all the way down: a clipped digit column has no text baseline, so inline it would sit high.
    <span className="flex">
      {digits.map((d, i) => {
        // Columns line up from the right: the ones under the ones.
        const o = old[old.length - digits.length + i];
        const rolled = from !== null && o !== d;
        return (
          <span key={digits.length - i} className="relative block h-[1.2em] w-[1ch] overflow-hidden text-center leading-[1.2em]">
            {rolled && o !== undefined && (
              <span key={`was-${value}`} className={`absolute inset-0 ${up ? "roll-out-up" : "roll-out-down"}`} aria-hidden>
                {o}
              </span>
            )}
            <span key={`is-${value}`} className={`block ${rolled ? (up ? "roll-in-up" : "roll-in-down") : ""}`}>
              {d}
            </span>
          </span>
        );
      })}
    </span>
  );
}
