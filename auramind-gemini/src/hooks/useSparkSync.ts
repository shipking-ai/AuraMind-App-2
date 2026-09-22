/**
 * useSparkSync — Surface 2 of the memory spark system.
 *
 * Sibling of useReminderSync (and mounted right next to it in App.tsx): keeps
 * the OS's daily spark notifications in step with the spark preferences.
 *
 * Behavior:
 *  - Native only. Web has no local-notification bridge; pop-ups cover it.
 *  - 'maintain' mode (app start): schedules only if permission is already
 *    granted — never prompts. Prompting on launch is how you get permanently
 *    denied; only the Settings toggle asks ('request' mode).
 *  - 2–4 one-shot notifications per day at re-randomized times inside waking
 *    hours (pure planner: lib/sparkNotificationSchedule). One-shots avoid the
 *    `repeats` trap that silently killed daily reminders.
 *  - Cancel-first with fixed IDs (7411–7414): a re-plan REPLACES, never stacks.
 *  - Re-plans when the calendar day changes while the app stays open, or when
 *    preferences change.
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '../lib/nativeShim';
import { useAppPreference } from '../lib/appPreferences';
import { useLocalNotifications } from './useNative';
import { useCurrentUserId } from './useCurrentUserId';
import {
  cardsSparkedToday,
  dropPendingSparks,
  getSparkLog,
  pickSparkCard,
  recordSpark,
} from '../services/memory/sparkScheduler';
import { buildSparkNotificationPlan } from '../lib/sparkNotificationSchedule';
import { dbService } from '../services/database/dbService';

export type SparkSyncMode = 'maintain' | 'request';

function dayKey(now: number): number {
  const d = new Date(now);
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
}

async function pickNotificationCard(userId: string, now: number, excludeCardIds: string[]): Promise<{ id: string; front: string } | null> {
  try {
    const cards = await dbService.fetchCards(userId);
    const history = getSparkLog();
    const exclude = new Set([...excludeCardIds, ...cardsSparkedToday(now, history)]);
    const eligible = cards.filter((c) => !exclude.has(c.id));
    const picked = pickSparkCard(eligible, { now, history });
    if (!picked) return null;
    return { id: picked.id, front: picked.front || picked.question || 'Quick recall' };
  } catch {
    return null;
  }
}

export function useSparkSync(mode: SparkSyncMode = 'maintain'): void {
  const [sparksEnabled] = useAppPreference('auramind_sparksEnabled', true);
  const [notificationsEnabled] = useAppPreference('auramind_sparksNotifications', true);
  const { requestPermissions, checkPermissions, schedule, cancel } = useLocalNotifications();
  const userId = useCurrentUserId();
  const plannedDayRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let abandoned = false;

    const plan = async () => {
      if (abandoned || busyRef.current) return;
      busyRef.current = true;
      try {
        // Cancel-first with fixed IDs: a changed plan replaces, never stacks.
        await Promise.all([...Array.from({ length: 4 }, (_, i) => 7411 + i)].map((id) => cancel(id)));
        // The cancelled notifications never fire, so forget their log entries.
        dropPendingSparks('notification');
        if (abandoned) return;

        if (!(sparksEnabled && notificationsEnabled)) return;

        const permission = mode === 'request' ? await requestPermissions() : await checkPermissions();
        if (abandoned) return;
        if (permission !== 'granted') return;

        const now = Date.now();
        const schedulePlan = buildSparkNotificationPlan({ count: 4, now });
        const usedCardIds: string[] = [];
        const usedAt: number[] = [];
        for (const slot of schedulePlan) {
          // Pick a card per slot at schedule time so the day's notifications
          // cover different cards; skip cards already claimed by an earlier
          // slot or sparked today (cross-surface suppression).
          const card = userId ? await pickNotificationCard(userId, now, usedCardIds) : null;
          if (abandoned) return;
          if (!card) break;
          usedCardIds.push(card.id);
          usedAt.push(new Date(slot.at).getTime());
          await schedule({
            id: slot.id,
            title: 'Memory spark',
            body: card.front,
            schedule: { at: new Date(slot.at) },
          });
        }
        // Log each spark at the time it will actually fire, so the pop-up's
        // spacing and the daily cap see it then — not at planning time.
        usedCardIds.forEach((id, i) => recordSpark('notification', id, usedAt[i]));
        plannedDayRef.current = dayKey(now);
      } catch {
        // Sparks are a convenience — never interrupt boot over them.
      } finally {
        busyRef.current = false;
      }
    };

    void plan();

    // Re-plan when the calendar day rolls over while the app is open.
    const interval = window.setInterval(() => {
      if (plannedDayRef.current !== null && plannedDayRef.current !== dayKey(Date.now())) {
        void plan();
      }
    }, 5 * 60 * 1000);

    return () => {
      abandoned = true;
      window.clearInterval(interval);
    };
  }, [sparksEnabled, notificationsEnabled, mode, cancel, requestPermissions, checkPermissions, schedule, userId]);
}

