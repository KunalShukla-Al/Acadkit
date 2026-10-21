import type { HiddenNotices } from "@/lib/thisWeek";

/**
 * Notices swiped away on the Study page, kept on this device. Storage can
 * throw (disabled, private mode) or hold something unreadable: then nothing
 * is hidden, and the notices simply show.
 */
const key = (pin: string) => `acadkit:hidden-notices:${pin}`;
const dayOf = (t: number) => new Date(t).toLocaleDateString("en-CA");

export function readHiddenNotices(pin: string): HiddenNotices {
  try {
    const raw = JSON.parse(localStorage.getItem(key(pin)) ?? "{}") as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

/** Saves the list, dropping notices past their last day: they'd be gone by now anyway. */
export function writeHiddenNotices(pin: string, hidden: HiddenNotices, now: number): void {
  const today = dayOf(now);
  const kept = Object.fromEntries(Object.entries(hidden).filter(([, until]) => until >= today));
  try {
    localStorage.setItem(key(pin), JSON.stringify(kept));
  } catch {
    // Storage is off: the swipe still hides it until the page reloads.
  }
}
