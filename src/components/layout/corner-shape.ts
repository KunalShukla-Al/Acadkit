import type { CSSProperties } from "react";

/** The corner's size, in px: a lime squircle floating clear of the screen's edges. */
export const CORNER = 58;

/** How far it floats in from the right edge, and up from the tab bar or the screen's foot. */
export const CORNER_INSET = 14;

/**
 * Round all over but for the corner facing the screen's own, drawn tighter so it
 * still points to where it lives. The menu's card shares it (corner-menu.tsx).
 */
export const cornerRadius = (round: number) => `${round}px ${round}px 10px ${round}px`;

/** Where the corner sits and its shape, shared by the corner and the menu's close button so one lands exactly on the other. */
export const cornerBox: CSSProperties = {
  width: CORNER,
  height: CORNER,
  right: CORNER_INSET,
  bottom: `calc(var(--nav-h, 0px) + ${CORNER_INSET}px)`,
  borderRadius: cornerRadius(22),
};
