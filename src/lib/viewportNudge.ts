/**
 * Home-screen iOS opens with fixed elements measured against a viewport
 * that stops short of the screen: the tab bar floats a status bar's height
 * above the bottom edge, over a strip of page background, until the page
 * first scrolls and WebKit measures again. A one-pixel scroll and back does
 * that measuring at once.
 */

type Nav = { standalone?: boolean };

/** iOS's home-screen mode, the only place the short viewport happens. Desktop and Android installs don't set `standalone`. */
export function needsNudge(nav: Nav = navigator as Nav): boolean {
  return nav.standalone === true;
}

/**
 * Scroll one pixel and back. A page too short to scroll gets the one
 * pixel it needs, only for the nudge.
 */
export function nudgeViewport(win: Window = window): void {
  const root = win.document.documentElement;
  const body = win.document.body;
  const y = win.scrollY;
  const short = root.scrollHeight <= root.clientHeight;
  if (short) body.style.minHeight = `${root.clientHeight + 1}px`;
  win.scrollTo({ top: y > 0 ? y - 1 : y + 1, behavior: "instant" });
  win.requestAnimationFrame(() => {
    win.scrollTo({ top: y, behavior: "instant" });
    if (short) body.style.minHeight = "";
  });
}
