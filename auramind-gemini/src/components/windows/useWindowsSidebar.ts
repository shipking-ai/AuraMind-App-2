import { useCallback, useEffect, useState } from 'react';
import { useAppPreference } from '../../lib/appPreferences';
import { isTextTarget } from '../../desktop/DesktopChrome';

const NARROW = '(max-width: 899px)';

function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(NARROW).matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(NARROW);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);
  return narrow;
}

/**
 * Collapsed or expanded, remembered in `bonamind_win_sidebar`. ☰ and Ctrl+B
 * toggle it; a narrow window shows it collapsed without changing the saved
 * choice.
 */
export function useWindowsSidebar(): { collapsed: boolean; toggle: () => void } {
  const [pref, setPref] = useAppPreference<string>('bonamind_win_sidebar', 'expanded');
  const narrow = useNarrowWindow();
  const collapsed = narrow || pref === 'collapsed';

  const toggle = useCallback(() => {
    setPref(collapsed ? 'expanded' : 'collapsed');
  }, [collapsed, setPref]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'b') return;
      if (isTextTarget(e.target)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  return { collapsed, toggle };
}
