export const REMINDER_IDS = {
  daily: 7401,
  due: 7402,
  streak: 7403,
  weekly: 7404,
} as const;

export interface ReminderPreferences {
  dailyReminder: boolean;
  dueReminder: boolean;
  streakReminder: boolean;
  weeklySummary: boolean;
  reminderTime: string;
}

export interface ScheduledReminder {
  id: number;
  title: string;
  body: string;
  schedule: {
    on: {
      weekday?: number;
      hour: number;
      minute: number;
    };
    /**
     * Capacitor treats an `on` pattern as one-shot unless this is set.
     * Without it the OS held each reminder with `repeats: false` and
     * `count: 1`, so a "daily" reminder fired once and never again -- the
     * pipeline looked healthy (permission granted, notifications pending)
     * while quietly doing nothing after day one.
     */
    repeats: boolean;
  };
}

function timeWithOffset(hour: number, minute: number, offsetMinutes: number) {
  const total = (hour * 60 + minute + offsetMinutes) % (24 * 60);
  return { hour: Math.floor(total / 60), minute: total % 60 };
}

/** Build only the notifications the user enabled; invalid times produce none. */
export function buildReminderNotifications({
  dailyReminder,
  dueReminder,
  streakReminder,
  weeklySummary,
  reminderTime,
}: ReminderPreferences): ScheduledReminder[] {
  const [hour, minute] = reminderTime.split(":").map(Number);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return [];
  }

  const notifications: ScheduledReminder[] = [];
  if (dailyReminder) {
    notifications.push({
      id: REMINDER_IDS.daily,
      title: "AuraMind study reminder",
      body: "Your review queue is ready. Keep your memory curve sharp.",
      schedule: { on: timeWithOffset(hour, minute, 0), repeats: true },
    });
  }
  if (dueReminder) {
    notifications.push({
      id: REMINDER_IDS.due,
      title: "AuraMind due cards",
      body: "You have cards waiting for a quick review.",
      schedule: { on: timeWithOffset(hour, minute, 15), repeats: true },
    });
  }
  if (streakReminder) {
    notifications.push({
      id: REMINDER_IDS.streak,
      title: "Protect your AuraMind streak",
      body: "A short session tonight keeps your rhythm intact.",
      schedule: { on: timeWithOffset(hour, minute, 30), repeats: true },
    });
  }
  if (weeklySummary) {
    notifications.push({
      id: REMINDER_IDS.weekly,
      title: "Your AuraMind week",
      body: "Take a minute to see what you strengthened this week.",
      schedule: { on: { weekday: 2, ...timeWithOffset(hour, minute, 45) }, repeats: true },
    });
  }
  return notifications;
}

export type SpokenReminderMode = 'off' | 'random' | 'chosen';

/** The lines a spoken reminder picks from ("random") or the user picks one of ("chosen"). */
export const SPOKEN_REMINDER_MESSAGES = [
  'Time for a quick AuraMind review. Your cards are waiting.',
  "Hey, it's study time. Five minutes now saves an hour later.",
  'Your memory curve is dipping. A short review will lift it right back up.',
  'Prof. Aura here. Ready for a few cards?',
  'Keep your streak alive. Open AuraMind for a quick session.',
  "Small reviews, big results. Let's clear your due cards.",
  "Knock knock. It's your flashcards. They miss you.",
  'Quick brain workout? Your review queue is ready.',
] as const;

/**
 * When the spoken reminder fires: with the first reminder the user enabled,
 * and only that one. The four reminders are 15 minutes apart, and a phone
 * talking four times in 45 minutes would be switched off by the second.
 */
export function spokenReminderTime(
  notifications: ScheduledReminder[],
): { hour: number; minute: number; weekday?: number } | null {
  const first = notifications[0];
  if (!first) return null;
  const { hour, minute, weekday } = first.schedule.on;
  return weekday === undefined ? { hour, minute } : { hour, minute, weekday };
}
