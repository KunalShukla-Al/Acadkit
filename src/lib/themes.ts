/** Theme identity, kept free of side effects. */
import tokens from "@/design/tokens.json";

export type ThemeName = "brutalist" | "oled";

/** Themes that actually exist in the stylesheet: the ones tokens.json defines. */
export const THEME_NAMES = Object.keys(tokens.themes) as ThemeName[];

/** Anything else stored (a theme since retired) comes back as this. */
export const DEFAULT_THEME: ThemeName = "brutalist";

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as string[]).includes(value);
}

/** Coerce whatever was stored into a theme that exists. */
export function resolveTheme(stored: unknown): ThemeName {
  return isThemeName(stored) ? stored : DEFAULT_THEME;
}
