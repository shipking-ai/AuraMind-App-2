import React, { useEffect, useMemo, useState, createContext, useContext } from "react";
import type { ThemeContextType } from "../types";
import {
  applyPreferenceToDocument,
  applyStoredPreferences,
  normalizeTheme,
  themeDefaults,
  useAppPreference,
} from "../lib/appPreferences";
import { isDesktopApp } from "../lib/platform";
import { desktop } from "../desktop/bridge";

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

// Theme preference is persisted centrally so every route sees the same mode.
export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const defaults = themeDefaults();
  const [storedTheme, setStoredTheme] = useAppPreference<string>("bonamind_theme", defaults.theme);
  const [autoNightMode] = useAppPreference<boolean>("bonamind_autoNightMode", defaults.autoNightMode);
  const theme = normalizeTheme(storedTheme);
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true,
  );
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());

  useEffect(() => {
    applyStoredPreferences();
  }, []);

  useEffect(() => {
    const updateClock = () => setCurrentHour(new Date().getHours());
    updateClock();
    if (!autoNightMode) return;
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, [autoNightMode]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  const systemResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  const isNight = currentHour >= 20 || currentHour < 7;
  const nightForced = autoNightMode && isNight;
  const resolvedTheme = nightForced ? "dark" : systemResolvedTheme;
  // "System" with nothing forcing dark: the Windows app leaves its window
  // following Windows rather than pinning the current colour.
  const followsSystem = theme === "system" && !nightForced;

  useEffect(() => {
    applyPreferenceToDocument("bonamind_theme", resolvedTheme);
    // The Windows app's frame, title bar and window background follow too.
    if (isDesktopApp()) {
      void desktop.applyTheme(resolvedTheme === "light" ? "light" : "dark", followsSystem);
    }
  }, [resolvedTheme, followsSystem]);

  const value = useMemo<ThemeContextType>(
    () => ({
      theme,
      setTheme: (nextTheme) => setStoredTheme(nextTheme),
      resolvedTheme,
      toggleTheme: () => setStoredTheme(resolvedTheme === "dark" ? "light" : "dark"),
      cycleTheme: () => {
        const next = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
        setStoredTheme(next);
      },
    }),
    [resolvedTheme, setStoredTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
