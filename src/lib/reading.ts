/**
 * Continue (migration 062): the viewer says where you're reading, and your
 * other device offers to pick it up there. A phone hands to a computer and
 * a computer to a phone.
 */

export type DeviceKind = "phone" | "computer";

export interface Reading {
  path: string;
  page: number | null;
  kind: DeviceKind;
  updated_at: string;
}

/** A phone or a tablet held like one (a touch screen without a mouse), else a computer. */
export function deviceKind(win: Pick<Window, "matchMedia"> = window): DeviceKind {
  return win.matchMedia("(pointer: coarse)").matches && !win.matchMedia("(any-pointer: fine)").matches ? "phone" : "computer";
}

/** How long a page stays worth offering: after half an hour you've put it down. */
const FRESH_MS = 30 * 60_000;

/** What to offer to continue here: a page read lately on the other kind of device, not the file open here. */
export function continueOffer(reading: Reading | null, { kind, now = Date.now(), open = null }: { kind: DeviceKind; now?: number; open?: string | null }): Reading | null {
  if (!reading || reading.kind === kind || reading.path === open) return null;
  return now - Date.parse(reading.updated_at) <= FRESH_MS ? reading : null;
}
