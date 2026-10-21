import { clampPage, pageUnder, screenPage, screenTop, type PageState } from "@/lib/pager";

/** Where the viewer is in the file, and a way to go elsewhere in it. */
export type Pager = PageState & { goTo(n: number): void };

/** The file's pages in reading order, or null for a file counted in screens. */
export type Pages = (() => HTMLElement[]) | null;

/**
 * Follow where `scroller` is: the page you're reading when the file has
 * pages, else the screenful. Calls `onChange` only when the page or
 * the count changes; returns the function that stops it.
 */
export function trackPages(
  scroller: HTMLElement,
  pages: Pages,
  onChange: (p: PageState) => void,
  { events = scroller, watch = [] }: { events?: EventTarget; watch?: Element[] } = {}
): () => void {
  let last = "";
  let frame = 0;
  const measure = () => {
    frame = 0;
    const els = pages?.();
    let state: PageState;
    if (els?.length) {
      const box = scroller.getBoundingClientRect();
      // The page across a line near the top: on a phone several short slides share the screen, and
      // the one you're reading is the top one. Scrolled to the very end, it's the last.
      const atEnd = scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
      const line = box.top + Math.min(box.height / 2, 120);
      state = { current: atEnd ? els.length : pageUnder(els.map((e) => e.getBoundingClientRect()), line), total: els.length };
    } else {
      state = screenPage(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
    }
    const key = `${state.current}/${state.total}`;
    if (key !== last) {
      last = key;
      onChange(state);
    }
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };
  measure();
  events.addEventListener("scroll", schedule, { passive: true });
  events.addEventListener("resize", schedule);
  // Pages arrive and change size as the file renders.
  const ro = new ResizeObserver(schedule);
  for (const el of [scroller, ...watch]) ro.observe(el);
  return () => {
    cancelAnimationFrame(frame);
    events.removeEventListener("scroll", schedule);
    events.removeEventListener("resize", schedule);
    ro.disconnect();
  };
}

/** Scroll `scroller` to page `n`: its top just under the box's top, or the n-th screenful. */
export function goToPage(scroller: HTMLElement, pages: Pages, n: number) {
  const els = pages?.();
  if (els?.length) {
    const el = els[clampPage(n, els.length) - 1];
    scroller.scrollTop += el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8;
    return;
  }
  const { total } = screenPage(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight);
  scroller.scrollTop = screenTop(n, total, scroller.scrollHeight, scroller.clientHeight);
}
