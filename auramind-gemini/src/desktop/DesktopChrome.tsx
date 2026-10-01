/**
 * Makes the Windows app behave like a Windows app rather than a browser tab:
 * reports first paint (the shell shows the window then, so there's no white
 * flash), names the window after the page, hides the browser's
 * Back/Reload/Inspect menu outside text fields, and adds desktop shortcuts.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { desktop } from './bridge';
import { isDesktopApp } from '../lib/platform';

const TITLES: Array<[string, string]> = [
  ['/dashboard/decks', 'Library'],
  ['/dashboard/study', 'Study'],
  ['/dashboard/chat', 'Prof. Aura'],
  ['/dashboard/generator', 'New course'],
  ['/dashboard/classes', 'Classes'],
  ['/dashboard/settings', 'Settings'],
  ['/deck/', 'Deck'],
  ['/auth', 'Sign in'],
];

export function windowTitleFor(pathname: string): string {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'Home · AuraMind';
  const hit = TITLES.find(([prefix]) => pathname.startsWith(prefix));
  return hit ? `${hit[1]} · AuraMind` : 'AuraMind';
}

export function isTextTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function DesktopChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const active = isDesktopApp();

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('platform-desktop');
    // Two frames: the first commits, the second has painted.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => void desktop.appReady()));
    return () => cancelAnimationFrame(id);
  }, [active]);

  useEffect(() => {
    if (active) void desktop.setTitle(windowTitleFor(location.pathname));
  }, [active, location.pathname]);

  useEffect(() => {
    if (!active) return;
    const onContextMenu = (e: MouseEvent) => { if (!isTextTarget(e.target)) e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); navigateRef.current('/dashboard/generator'); }
      if (e.key === ',') { e.preventDefault(); navigateRef.current('/dashboard/settings'); }
    };
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  return null;
}
