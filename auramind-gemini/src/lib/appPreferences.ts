import { useCallback, useEffect, useState } from "react";
import { isDesktopApp } from "./platform";

export type PreferenceValue = string | number | boolean | null;

/**
 * Theme defaults before the user picks one. The Windows app follows the
 * Windows light/dark setting, so it starts on "system" with auto night mode
 * off (that mode forces dark 20:00–07:00 whatever Windows says).
 */
export function themeDefaults(): { theme: "system" | "dark"; autoNightMode: boolean } {
  return isDesktopApp()
    ? { theme: "system", autoNightMode: false }
    : { theme: "dark", autoNightMode: true };
}
export type PreferenceSetter<T> = T | ((previous: T) => T);

const CHANGE_EVENT = "bonamind:preferences-changed";

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parseValue<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function normalizeTheme(value: unknown): "light" | "dark" | "system" {
  const normalized = String(value ?? "dark").toLowerCase();
  if (normalized === "light") return "light";
  if (normalized === "system") return "system";
  return "dark";
}

function token(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function resolveTheme(value: unknown): "light" | "dark" {
  const theme = normalizeTheme(value);
  if (
    theme === "system" &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme === "system" ? "dark" : theme;
}

/** Apply the preferences that have a document-level effect without a reload. */
export function applyPreferenceToDocument(key: string, value: unknown): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  switch (key) {
    case "bonamind_theme": {
      const resolved = resolveTheme(value);
      root.dataset.theme = normalizeTheme(value);
      root.classList.toggle("light", resolved === "light");
      root.classList.toggle("dark", resolved === "dark");
      root.style.colorScheme = resolved;
      break;
    }
    case "bonamind_fontSize":
      root.dataset.fontSize = token(value) || "medium";
      break;
    case "bonamind_highContrast":
      root.dataset.highContrast = String(Boolean(value));
      break;
    case "bonamind_reduceMotion":
      root.dataset.reduceMotion = String(Boolean(value));
      break;
    case "bonamind_compactMode":
      root.dataset.compactMode = String(Boolean(value));
      break;
    case "bonamind_autoNightMode":
      root.dataset.autoNightMode = String(Boolean(value));
      break;
    case "bonamind_autoSync":
      root.dataset.autoSync = String(Boolean(value));
      break;
    case "bonamind_offlineMode":
      root.dataset.offlineMode = String(Boolean(value));
      break;
    case "bonamind_soundEffects":
      root.dataset.soundEffects = String(Boolean(value));
      break;
    case "bonamind_textToSpeech":
      root.dataset.textToSpeech = String(Boolean(value));
      break;
    case "bonamind_autoPlayAudio":
      root.dataset.autoPlayAudio = String(Boolean(value));
      break;
    default:
      break;
  }
}

/** Apply all persisted document-level settings during app boot. */
export function applyStoredPreferences(): void {
  const keys = [
    "bonamind_theme",
    "bonamind_fontSize",
    "bonamind_highContrast",
    "bonamind_reduceMotion",
    "bonamind_compactMode",
    "bonamind_autoNightMode",
    "bonamind_autoSync",
    "bonamind_offlineMode",
    "bonamind_soundEffects",
    "bonamind_textToSpeech",
    "bonamind_autoPlayAudio",
  ];

  for (const key of keys) {
    const raw = readRaw(key);
    if (raw !== null) {
      applyPreferenceToDocument(key, parseValue(raw, null));
    }
  }
}

export function getAppPreference<T>(key: string, fallback: T): T {
  return parseValue(readRaw(key), fallback);
}

export function setAppPreference<T extends PreferenceValue>(key: string, value: T): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private browsing and storage quotas should not make a control unusable.
    }
    applyPreferenceToDocument(key, value);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key, value } }));
  }
}

export function subscribeToAppPreferences(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleChange = () => listener();
  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener("storage", handleChange);
  };
}

/**
 * A small synchronous preference hook shared by web Settings and the native
 * Android Settings surface. It keeps separate mounted screens in sync and
 * gives every setter an immediate document side effect where applicable.
 */
export function useAppPreference<T>(
  key: string,
  fallback: T,
): [T, (value: PreferenceSetter<T>) => void] {
  const [value, setValue] = useState<T>(() => getAppPreference(key, fallback));

  useEffect(() => {
    setValue(getAppPreference(key, fallback));
    return subscribeToAppPreferences(() => {
      setValue(getAppPreference(key, fallback));
    });
  }, [key, fallback]);

  const update = useCallback(
    (next: PreferenceSetter<T>) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (value: T) => T)(previous) : next;
        setAppPreference(key, resolved as PreferenceValue);
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
