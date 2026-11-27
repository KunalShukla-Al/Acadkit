import { parseISODate, toISODate } from "@acadkit/core/dates";
import type { PortalSnapshot } from "@acadkit/core/types";

/**
 * Whether the portal sync is still keeping up. "final" means the portal
 * last read on or after the semester's last class day, so no later sync can
 * change its numbers, however long ago that was.
 */

export type SyncState = "fresh" | "aging" | "stale" | "final" | "never";

export interface SyncHealth {
  state: SyncState;
  /** Days since the portal's own as-of date, or null if never synced. */
  days: number | null;
  asOf: string | null;
}

/** Beyond this the numbers on screen are probably wrong. */
const AGING_DAYS = 3;
const STALE_DAYS = 7;

/** The semester's last day with a day order (core's buildEffectiveMap): after it, attendance can't change. */
export function lastClassDay(effective: Record<string, number>): string | null {
  const days = Object.keys(effective);
  return days.length ? days.reduce((a, b) => (b > a ? b : a)) : null;
}

export function syncHealth(
  snapshots: PortalSnapshot[],
  today: Date = new Date(),
  lastClass: string | null = null
): SyncHealth {
  if (!snapshots.length) return { state: "never", days: null, asOf: null };

  // The oldest as_of across subjects: one subject lagging still means
  // the picture as a whole is that old.
  const asOf = snapshots
    .map((s) => s.as_of)
    .filter(Boolean)
    .sort()[0];
  if (!asOf) return { state: "never", days: null, asOf: null };

  const days = Math.max(
    0,
    Math.round(
      (parseISODate(toISODate(today)).getTime() - parseISODate(asOf).getTime()) / 86_400_000
    )
  );

  const state: SyncState =
    lastClass && asOf >= lastClass ? "final" : days >= STALE_DAYS ? "stale" : days >= AGING_DAYS ? "aging" : "fresh";
  return { state, days, asOf };
}
