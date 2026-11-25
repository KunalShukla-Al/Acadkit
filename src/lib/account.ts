/**
 * Which signed-in account work on this device belongs to. Signing out
 * moves it on, so a download that began under the old account can see it
 * is stale before it writes anything (src/lib/fileCache.ts,
 * src/lib/tomorrowOffline.ts).
 */

let epoch = 0;

/** The account work is starting under now. */
export function accountEpoch(): number {
  return epoch;
}

/** Whether `started` is still the signed-in account. */
export function stillCurrent(started: number): boolean {
  return started === epoch;
}

/** The account has ended (sign-out): everything begun before is stale. */
export function endAccount(): void {
  epoch += 1;
}
