import { describe, expect, it } from "vitest";
import { buildReminderNotifications, REMINDER_IDS, spokenReminderTime } from "../lib/reminderSchedule";

describe("reminder schedule", () => {
  it("builds only enabled reminders at predictable offsets", () => {
    const notifications = buildReminderNotifications({
      dailyReminder: true,
      dueReminder: true,
      streakReminder: false,
      weeklySummary: true,
      reminderTime: "23:50",
    });

    expect(notifications.map(({ id }) => id)).toEqual([
      REMINDER_IDS.daily,
      REMINDER_IDS.due,
      REMINDER_IDS.weekly,
    ]);
    expect(notifications[0].schedule.on).toEqual({ hour: 23, minute: 50 });
    expect(notifications[1].schedule.on).toEqual({ hour: 0, minute: 5 });
    expect(notifications[2].schedule.on).toEqual({
      weekday: 2,
      hour: 0,
      minute: 35,
    });
  });

  /**
   * Regression cover for a silent failure.
   *
   * Capacitor treats an `on` pattern as one-shot unless `repeats` is set, so
   * every reminder was scheduled with repeats:false and count:1. Everything
   * downstream looked healthy -- permission granted, notifications pending on
   * the device -- but a "daily" reminder fired once and then never again,
   * which is invisible until a user notices the app stopped nudging them a
   * week later.
   *
   * The prior tests asserted ids and times only, so they passed before and
   * after the fix. This asserts the property that actually makes a reminder a
   * reminder.
   */
  it("schedules every reminder as recurring", () => {
    const notifications = buildReminderNotifications({
      dailyReminder: true,
      dueReminder: true,
      streakReminder: true,
      weeklySummary: true,
      reminderTime: "09:00",
    });

    expect(notifications).toHaveLength(4);
    for (const notification of notifications) {
      expect(
        notification.schedule.repeats,
        `${notification.title} must recur; a one-shot daily reminder fires once and stops`,
      ).toBe(true);
    }
  });

  it("returns no schedules for an invalid clock value", () => {
    expect(
      buildReminderNotifications({
        dailyReminder: true,
        dueReminder: true,
        streakReminder: true,
        weeklySummary: true,
        reminderTime: "25:99",
      }),
    ).toEqual([]);
  });
});

describe('spokenReminderTime', () => {
  it('speaks with the first enabled reminder only', () => {
    const all = buildReminderNotifications({
      dailyReminder: false,
      dueReminder: true,
      streakReminder: true,
      weeklySummary: false,
      reminderTime: '20:00',
    });
    // Daily is off, so the due-cards reminder (+15 min) is first.
    expect(spokenReminderTime(all)).toEqual({ hour: 20, minute: 15 });
  });

  it('keeps the weekday for a weekly-only schedule and returns null when nothing is on', () => {
    const weekly = buildReminderNotifications({
      dailyReminder: false,
      dueReminder: false,
      streakReminder: false,
      weeklySummary: true,
      reminderTime: '09:00',
    });
    expect(spokenReminderTime(weekly)).toEqual({ hour: 9, minute: 45, weekday: 2 });
    expect(spokenReminderTime([])).toBeNull();
  });
});
