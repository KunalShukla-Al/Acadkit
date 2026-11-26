/**
 * The installed iPhone app can open with its viewport a status bar's height
 * short of the screen, and stay that way until the first scroll. Anything
 * pinned with `bottom: 0` then floats above the screen's foot, over a strip of
 * page background. `--viewport-gap` holds that shortfall in px, and
 * bottom-pinned elements sit that much lower (`bottom-screen` in index.css).
 * It is 0 everywhere else.
 */

export type Measure = {
  /** iOS's home-screen mode, the only place the short viewport happens. */
  standalone: boolean;
  landscape: boolean;
  screenWidth: number;
  screenHeight: number;
  innerWidth: number;
  /** The height of the box `position: fixed` lays out in, which is where `bottom: 0` lands. */
  viewportHeight: number;
  /** `env(safe-area-inset-top)`: the status bar the page draws under. */
  topInset: number;
};

/** How far short of the screen's foot a `bottom: 0` element lands, in whole px. */
export function viewportGap(m: Measure): number {
  if (!m.standalone) return 0;
  const short = Math.min(m.screenWidth, m.screenHeight);
  const long = Math.max(m.screenWidth, m.screenHeight);
  const [width, height] = m.landscape ? [long, short] : [short, long];

  // A window narrower than the screen (an iPad side by side) has its own foot.
  if (Math.abs(m.innerWidth - width) > 1) return 0;

  // The viewport loses at most the status bar. A page that starts below the
  // status bar (no top inset) is short by design, and its foot is the screen's.
  const gap = Math.round(height - m.viewportHeight);
  return gap > 0 && gap <= Math.round(m.topInset) + 2 ? gap : 0;
}

/**
 * Keeps `--viewport-gap` current. A full-height fixed probe takes the
 * viewport's height, so its resizes report every change, the scroll that
 * fixes the gap included, before the next frame is drawn.
 */
export function watchViewportGap(win: Window = window): void {
  if ((win.navigator as { standalone?: boolean }).standalone !== true) return;
  const doc = win.document;
  const probe = doc.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;bottom:0;left:0;width:1px;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none";
  doc.body.append(probe);

  let shown = -1;
  new ResizeObserver(() => {
    const gap = viewportGap({
      standalone: true,
      landscape: win.matchMedia("(orientation: landscape)").matches,
      screenWidth: win.screen.width,
      screenHeight: win.screen.height,
      innerWidth: win.innerWidth,
      viewportHeight: probe.getBoundingClientRect().height,
      topInset: parseFloat(win.getComputedStyle(probe).paddingTop) || 0,
    });
    if (gap === shown) return;
    shown = gap;
    doc.documentElement.style.setProperty("--viewport-gap", `${gap}px`);
  }).observe(probe);
}
