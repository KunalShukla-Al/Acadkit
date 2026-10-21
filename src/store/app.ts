import { create } from "zustand";
import { getStoredPin, storePin, clearPin } from "@/lib/pin";
import { resolveTheme, type ThemeName } from "@/lib/themes";
import { backgrounds } from "@/design/css";
import tokens from "@/design/tokens.json";

export type { ThemeName } from "@/lib/themes";
export { DEFAULT_THEME, isThemeName, THEME_NAMES } from "@/lib/themes";
export type ColorMode = "light" | "dark" | "system";

const THEME_KEY = "acadkit:theme-name";
const MODE_KEY = "acadkit:theme-mode";
const LEGACY_MODE_KEY = "acadkit:theme"; // pre-multi-theme key, mode-only
const NAME_KEY = "acadkit:name";
/**
 * The theme this device chose that the account hasn't confirmed yet ("oled|dark"), written the
 * moment it's chosen: a reload or a closed app can cut the publish off before the account has it,
 * and the next load must not take the account's older theme over it (src/hooks/useThemeSync.ts).
 */
const THEME_UNSENT_KEY = "acadkit:theme-unsent";

export function unsentTheme(): string | null {
  try {
    return localStorage.getItem(THEME_UNSENT_KEY);
  } catch {
    return null;
  }
}

export function setUnsentTheme(pair: string | null) {
  try {
    if (pair) localStorage.setItem(THEME_UNSENT_KEY, pair);
    else localStorage.removeItem(THEME_UNSENT_KEY);
  } catch {
    // Storage off: a cut-off publish can still lose the pick.
  }
}

/** "1" when Tomorrow offline is turned off on this device (src/lib/tomorrow.ts). */
const TOMORROW_OFF_KEY = "acadkit:tomorrow-off";

function resolveDark(mode: ColorMode): boolean {
  return mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

// Each theme's --bg as hex, for the browser's theme-color.
const BG_HEX = backgrounds(tokens);

function applyTheme(themeName: ThemeName, mode: ColorMode) {
  const dark = resolveDark(mode);
  document.documentElement.dataset.theme = themeName;
  document.documentElement.classList.toggle("dark", dark);
  document
    .getElementById("theme-color-meta")
    ?.setAttribute("content", BG_HEX[`${themeName}-${dark ? "dark" : "light"}`]);
}

interface AppState {
  pin: string | null;
  themeName: ThemeName;
  themeMode: ColorMode;
  /** Local copy of the display name (settings.name wins when present). */
  name: string;
  /** Tomorrow's files go onto this device in the evening (Settings). */
  tomorrowOffline: boolean;
  setPin: (pin: string) => void;
  resetPin: () => void;
  setThemeName: (theme: ThemeName) => void;
  setThemeMode: (mode: ColorMode) => void;
  setName: (name: string) => void;
  setTomorrowOffline: (on: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  pin: getStoredPin(),
  themeName: resolveTheme(localStorage.getItem(THEME_KEY)),
  themeMode:
    (localStorage.getItem(MODE_KEY) as ColorMode) ||
    (localStorage.getItem(LEGACY_MODE_KEY) as ColorMode) ||
    "system",
  name: localStorage.getItem(NAME_KEY) ?? "",
  tomorrowOffline: localStorage.getItem(TOMORROW_OFF_KEY) !== "1",
  setPin: (pin) => {
    storePin(pin);
    set({ pin });
  },
  resetPin: () => {
    clearPin();
    set({ pin: null });
  },
  setThemeName: (themeName) => {
    localStorage.setItem(THEME_KEY, themeName);
    setUnsentTheme(`${themeName}|${useAppStore.getState().themeMode}`);
    applyTheme(themeName, useAppStore.getState().themeMode);
    set({ themeName });
  },
  setThemeMode: (themeMode) => {
    localStorage.setItem(MODE_KEY, themeMode);
    setUnsentTheme(`${useAppStore.getState().themeName}|${themeMode}`);
    applyTheme(useAppStore.getState().themeName, themeMode);
    set({ themeMode });
  },
  setName: (name) => {
    localStorage.setItem(NAME_KEY, name);
    set({ name });
  },
  setTomorrowOffline: (tomorrowOffline) => {
    if (tomorrowOffline) localStorage.removeItem(TOMORROW_OFF_KEY);
    else localStorage.setItem(TOMORROW_OFF_KEY, "1");
    set({ tomorrowOffline });
  },
}));

// React to OS theme changes while in "system" mode
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { themeName, themeMode } = useAppStore.getState();
  if (themeMode === "system") applyTheme(themeName, themeMode);
});
