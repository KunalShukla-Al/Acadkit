import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSettings } from "@/api/settings";
import { usePin, useSettings, useUpdateSettings } from "@/hooks/useData";
import { setUnsentTheme, unsentTheme, useAppStore, type ColorMode } from "@/store/app";
import { isThemeName } from "@/lib/themes";

/** Keeps the theme on the account rather than on the device. */

const MODES: ColorMode[] = ["light", "dark", "system"];
const isColorMode = (v: unknown): v is ColorMode =>
  typeof v === "string" && (MODES as string[]).includes(v);

export function useThemeSync() {
  const pin = usePin();
  const { data: settings } = useSettings();
  // The account's theme as the server has it now, read once and never kept on disk ("theme-account"
  // is unpersisted, App.tsx): settings restored from IndexedDB after mount look freshly fetched,
  // and an old theme in them used to win over a newer one, here and on the account.
  const { data: account, isSuccess: accountRead } = useQuery({
    queryKey: ["theme-account", pin],
    queryFn: () => fetchSettings(pin),
    staleTime: Infinity,
    retry: 2,
  });
  const update = useUpdateSettings();

  const themeName = useAppStore((s) => s.themeName);
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeName = useAppStore((s) => s.setThemeName);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  /** What the device was using before the user touched anything. */
  const [atMount] = useState({ name: themeName, mode: themeMode });
  /** A pick from an earlier session the account never confirmed (the store notes it): this device's choice still stands. */
  const [unsentAtMount] = useState(() => unsentTheme() === `${themeName}|${themeMode}`);
  const pickedThisSession = unsentAtMount || themeName !== atMount.name || themeMode !== atMount.mode;

  /** Only the first reconciliation may overwrite the local choice. */
  const reconciled = useRef(false);

  /** The last theme this hook actually published. */
  const published = useRef<string | null>(null);

  useEffect(() => {
    if (!reconciled.current) {
      // Wait for the account as it is now, unless the user has just made a choice that outranks it anyway.
      if (!accountRead && !pickedThisSession) return;
      reconciled.current = true;

      if (!pickedThisSession) {
        const storedName = isThemeName(account?.theme) ? account.theme : null;
        const storedMode = isColorMode(account?.theme_mode) ? account.theme_mode : null;
        if (storedName || storedMode) {
          if (storedName && storedName !== themeName) setThemeName(storedName);
          if (storedMode && storedMode !== themeMode) setThemeMode(storedMode);
          return;
        }
        // Nothing stored: fall through and publish this device's choice.
      }
    }
    if (!settings) return;

    const pair = `${themeName}|${themeMode}`;
    const confirmed = () => unsentTheme() === pair && setUnsentTheme(null);
    if (settings.theme !== themeName || settings.theme_mode !== themeMode) {
      if (published.current !== pair) {
        published.current = pair;
        // A failed publish keeps the note (its own toast says so); a cut-off one leaves it for the next load.
        update.mutateAsync({ theme: themeName, theme_mode: themeMode }).then(confirmed, () => {});
      }
    } else if (account?.theme === themeName && account?.theme_mode === themeMode && !update.isPending) {
      // The account, as read from the server, already says so.
      confirmed();
    }
    // `update` is a stable mutation object; including it would re-run this
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings,
    account,
    accountRead,
    update.isPending,
    pickedThisSession,
    themeName,
    themeMode,
    setThemeName,
    setThemeMode,
  ]);
}
