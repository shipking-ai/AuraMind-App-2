import { useEffect } from 'react';
import { Capacitor } from '../lib/nativeShim';
import { useAppPreference } from '../lib/appPreferences';
import {
  buildReminderNotifications,
  REMINDER_IDS,
  SPOKEN_REMINDER_MESSAGES,
  spokenReminderTime,
  type ScheduledReminder,
  type SpokenReminderMode,
} from '../lib/reminderSchedule';
import { AuraSpeech, hasNativeSpeech } from '../lib/auraSpeech';
import { VOICE_AUTO, VOICE_PREF_KEY } from '../services/voice/speechOutput';
import { useLocalNotifications } from './useNative';

/**
 * Arm or disarm the Android alarm that speaks the reminder aloud. It rides
 * on the notification reminders: no scheduled reminder, no voice.
 */
async function syncSpokenReminder(
  notifications: ScheduledReminder[],
  mode: SpokenReminderMode,
  chosenMessage: string,
  voice: string,
): Promise<void> {
  if (!hasNativeSpeech()) return;
  const time = spokenReminderTime(notifications);
  if (mode === 'off' || !time) {
    await AuraSpeech.setSpokenReminder({ enabled: false });
    return;
  }
  await AuraSpeech.setSpokenReminder({
    enabled: true,
    ...time,
    mode,
    message: chosenMessage || SPOKEN_REMINDER_MESSAGES[0],
    messages: [...SPOKEN_REMINDER_MESSAGES],
    // "random" is resolved natively, so each reminder gets a fresh voice.
    voice,
    lang: 'en-US',
  });
}

/**
 * Keep the OS's scheduled reminders in step with the user's preferences.
 *
 * WHY THIS RUNS AT APP START
 *
 * Reminder syncing used to live only in the two Settings screens, so the OS
 * was only ever corrected while a user happened to be looking at that page.
 * That was invisible until reminders were being scheduled wrongly: when the
 * missing `repeats` flag was fixed, every existing install kept its one-shot
 * alarms until the user next opened Settings — which, for someone who set
 * their reminder once months ago, is never.
 *
 * Anything that repairs state has to run where the state is used, not where
 * it is edited.
 *
 * WHY THE MODE ARGUMENT
 *
 * 'maintain' checks the permission and schedules only if it is already
 * granted. 'request' will raise the system dialog.
 *
 * The distinction matters: prompting for notifications the moment an app
 * opens is the fastest way to get permanently denied, and a permission
 * dialog on launch is not something the user asked for. So app start
 * maintains, and only an explicit toggle in Settings asks.
 */
export type ReminderSyncMode = 'maintain' | 'request';

export function useReminderSync(mode: ReminderSyncMode = 'maintain'): void {
  const [dailyReminder] = useAppPreference('auramind_dailyReminder', true);
  const [dueReminder] = useAppPreference('auramind_dueReminder', true);
  const [streakReminder] = useAppPreference('auramind_streakReminder', true);
  const [weeklySummary] = useAppPreference('auramind_weeklySummary', false);
  const [reminderTime] = useAppPreference('auramind_reminderTime', '09:00');
  const [spokenMode] = useAppPreference<SpokenReminderMode>('auramind_spokenReminder', 'off');
  const [spokenMessage] = useAppPreference('auramind_spokenReminderMessage', '');
  const [voice] = useAppPreference<string>(VOICE_PREF_KEY, VOICE_AUTO);

  const { requestPermissions, checkPermissions, schedule, cancel } = useLocalNotifications();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let abandoned = false;

    void (async () => {
      try {
        // Cancel first so a disabled reminder actually disappears, and so a
        // reminder whose shape changed (the repeats fix) is replaced rather
        // than left alongside the old alarm.
        await Promise.all(Object.values(REMINDER_IDS).map((id) => cancel(id)));
        if (abandoned) return;

        const notifications = buildReminderNotifications({
          dailyReminder,
          dueReminder,
          streakReminder,
          weeklySummary,
          reminderTime,
        });
        if (notifications.length === 0) {
          await syncSpokenReminder([], 'off', '', voice);
          return;
        }

        const permission =
          mode === 'request' ? await requestPermissions() : await checkPermissions();
        if (abandoned) return;
        if (permission !== 'granted') {
          await syncSpokenReminder([], 'off', '', voice);
          return;
        }

        await Promise.all(notifications.map((notification) => schedule(notification)));
        if (abandoned) return;
        await syncSpokenReminder(notifications, spokenMode, spokenMessage, voice);
      } catch {
        // Reminders are a convenience. A missing permission or an unavailable
        // bridge must never interrupt whatever the user is actually doing.
      }
    })();

    return () => {
      abandoned = true;
    };
  }, [
    mode,
    dailyReminder,
    dueReminder,
    streakReminder,
    weeklySummary,
    reminderTime,
    spokenMode,
    spokenMessage,
    voice,
    requestPermissions,
    checkPermissions,
    schedule,
    cancel,
  ]);
}
