import { Capacitor } from './nativeShim';
import {
  getAppPreference,
  setAppPreference,
  subscribeToAppPreferences,
  type PreferenceValue,
} from './appPreferences';

/**
 * Material You for the Android shell.
 *
 * The native ThemeColors plugin reads the wallpaper-derived system palette
 * (Android 12+); this module applies it as CSS variables. Brand violet stays
 * the fallback everywhere, so non-dynamic devices render pixel-identical to
 * before.
 *
 * The last scheme is cached in preferences and applied synchronously at
 * startup, then refreshed from the bridge: wallpaper changes apply on the
 * next launch without a flash of violet first.
 */

export interface DynamicScheme {
  primary: string;
  primaryContainer: string;
  secondary: string;
  tertiary: string;
  surface: string;
  night: boolean;
}

const CACHE_KEY = 'auramind_dynamic_scheme';

const VAR_MAP: Array<[string, keyof Omit<DynamicScheme, 'night'>]> = [
  ['--android-dynamic-primary', 'primary'],
  ['--android-dynamic-primary-container', 'primaryContainer'],
  ['--android-dynamic-secondary', 'secondary'],
  ['--android-dynamic-tertiary', 'tertiary'],
  ['--android-dynamic-surface', 'surface'],
];

function plugin(): any {
  return (Capacitor as unknown as { Plugins?: Record<string, any> })?.Plugins?.ThemeColors;
}

function applyScheme(scheme: DynamicScheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [variable, key] of VAR_MAP) {
    root.style.setProperty(variable, scheme[key]);
  }
  root.dataset.dynamicColor = scheme.night ? 'dark' : 'light';
}

function applyCached(): void {
  try {
    const cached = getAppPreference<DynamicScheme | null>(CACHE_KEY, null);
    if (cached?.primary) applyScheme(cached);
  } catch {
    // Cache is garnish; the bridge refresh follows.
  }
}

/**
 * The palette must match the theme actually on screen. The app has its own
 * theme setting (dark / light / system) independent of the OS uiMode — a
 * dark-only session on a light-mode phone needs the dark tones, not the
 * light ones, or wallpaper tinting visibly fights the UI.
 */
function isNight(): boolean {
  try {
    const theme = String(getAppPreference('auramind_theme', 'dark')).toLowerCase();
    if (theme === 'light') return false;
    if (theme === 'dark') return true;
  } catch {
    return true;
  }
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

async function refresh(): Promise<void> {
  const native = plugin();
  if (!native?.getDynamicColors) return;
  try {
    const scheme = (await native.getDynamicColors({ night: isNight() })) as DynamicScheme;
    if (!scheme?.primary) return;
    applyScheme(scheme);
    // Only persist when the palette actually changed. refresh() is wired to
    // the preferences-change event (theme flips must re-tint), and a write to
    // the same value would otherwise dispatch that very event again — an
    // infinite cache-write loop that floods the native bridge and starves the
    // React scheduler until every tap goes dead.
    const cached = getAppPreference<DynamicScheme | null>(CACHE_KEY, null);
    if (!cached || cached.primary !== scheme.primary || cached.night !== scheme.night) {
      // Cast mirrors useAppPreference: the object JSON-round-trips through
      // localStorage, and the type is only lying for one function call.
      setAppPreference(CACHE_KEY, { ...scheme } as unknown as PreferenceValue);
    }
  } catch {
    // No dynamic palette (pre-12, OEM without overlays): brand violet stands.
  }
}

let subscribed = false;

/** Apply cached scheme instantly, then refresh from the system. Native-only. */
export function initDynamicColor(): void {
  if (!Capacitor.isNativePlatform()) return;
  applyCached();
  void refresh();
  if (!subscribed) {
    subscribed = true;
    // A theme flip must re-tint: light tones on a dark UI (or vice versa)
    // is exactly the mismatch this module exists to prevent.
    subscribeToAppPreferences(() => {
      void refresh();
    });
  }
}
