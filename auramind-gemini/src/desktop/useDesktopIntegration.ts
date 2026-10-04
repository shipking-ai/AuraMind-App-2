/**
 * The main window's side of the Windows app: tell the shell what's due,
 * plan nudges, and act on what the shell forwards (links, files, routes,
 * Quick Review ratings). Does nothing outside the Windows app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { Card, Deck } from '../types';
import { desktop, type FileHandoff } from './bridge';
import { computeDueState } from './dueState';
import { DEFAULT_NUDGE_PREFS, planNudges } from './nudgePlanner';
import { routeDeepLink } from './deepLinkRouter';
import { fileFromHandoff, unsupportedMessage } from '../lib/courseFiles';
import { offerGeneratorFile } from '../lib/pendingGeneratorFile';
import { refreshWorkspace } from '../lib/workspaceRefresh';
import { useStudyStats } from '../hooks/useStudyStats';
import { useAppPreference } from '../lib/appPreferences';
import { supabase } from '../services/database/supabase';

export const QUICK_REVIEW_SHORTCUT_PREF = 'auramind_quickReviewShortcut';
export const DEFAULT_QUICK_REVIEW_SHORTCUT = 'CommandOrControl+Alt+Space';
const MINUTE = 60_000;

function handoffError(h: Extract<FileHandoff, { kind: 'error' }>): string {
  if (h.reason === 'too-large') return `${h.name} is over the 50 MB limit.`;
  if (h.reason === 'unreadable') return `BonaMind couldn't open ${h.name}.`;
  return unsupportedMessage(h.name);
}

function useMinuteTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), MINUTE);
    return () => clearInterval(id);
  }, [enabled]);
  return tick;
}

export function useDesktopIntegration(input: {
  cards: Card[];
  decks: Deck[];
  userId: string | null | undefined;
  enabled: boolean;
}): void {
  const { cards, decks, userId, enabled } = input;
  const navigate = useNavigate();
  const location = useLocation();
  const { streak } = useStudyStats(userId ?? null);
  const [reminderTime] = useAppPreference('auramind_reminderTime', DEFAULT_NUDGE_PREFS.reminderTime);
  const [dailyReminder] = useAppPreference('auramind_dailyReminder', true);
  const [dueReminder] = useAppPreference('auramind_dueReminder', true);
  const [shortcut] = useAppPreference(QUICK_REVIEW_SHORTCUT_PREF, DEFAULT_QUICK_REVIEW_SHORTCUT);
  const studying = location.pathname.startsWith('/dashboard/study/');

  // Re-evaluate each minute: cards become due with time, not only on change.
  const tick = useMinuteTick(enabled);
  const state = useMemo(
    () => computeDueState({ cards, decks, now: Date.now(), streak: streak ?? 0, studying }),
    // tick forces a recompute every minute
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cards, decks, streak, studying, tick],
  );
  const last = useRef('');
  useEffect(() => {
    if (!enabled) return;
    const key = JSON.stringify([state, reminderTime, dailyReminder, dueReminder]);
    if (key === last.current) return;
    last.current = key;
    void desktop.setDueState(state);
    void desktop.scheduleNudges(
      planNudges(state, { ...DEFAULT_NUDGE_PREFS, reminderTime, dailyReminder, dueReminder }, Date.now()),
    );
  }, [enabled, state, reminderTime, dailyReminder, dueReminder]);

  useEffect(() => {
    if (enabled && shortcut !== DEFAULT_QUICK_REVIEW_SHORTCUT) void desktop.setShortcut(shortcut);
  }, [enabled, shortcut]);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  useEffect(() => {
    if (!enabled) return;
    const go = (path: string) => navigateRef.current(path);
    const offs = [
      desktop.on('deep-link', ({ url }) => {
        void routeDeepLink(url, {
          navigate: go,
          exchangeCode: async (code) =>
            supabase ? supabase.auth.exchangeCodeForSession(code) : { error: new Error('offline') },
        });
      }),
      desktop.on('create-from-file', (h) => {
        if (h.kind === 'error') {
          toast.error(handoffError(h));
          return;
        }
        offerGeneratorFile(fileFromHandoff(h));
        go('/dashboard/generator');
      }),
      desktop.on('open-route', ({ path }) => {
        if (path.startsWith('/') && !path.startsWith('//')) go(path);
      }),
      desktop.on('cards-changed', () => { void refreshWorkspace(); }),
    ];
    return () => { offs.forEach((p) => void p.then((off) => off())); };
  }, [enabled]);
}
