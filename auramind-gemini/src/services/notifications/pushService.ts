import { Capacitor, LocalNotifications, PushNotifications } from '../../lib/nativeShim';
import { supabase } from '../database/supabase';

/**
 * Server-sent push (FCM), wired end to end but dormant until Firebase is
 * configured.
 *
 * ACTIVATION CHECKLIST (no further code changes needed):
 *   1. Create a Firebase project, add an Android app with id com.auramind.app.
 *   2. Drop the downloaded file at android/app/google-services.json and rebuild
 *      (the gradle google-services plugin applies itself when present).
 *   3. Set FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_KEY (full key JSON, raw or
 *      base64) on the API. `api/_lib/push.ts` then delivers via FCM HTTP v1:
 *      admin POST /api/push/send, plus daily due-card reminders on the
 *      existing /api/cron/dunning run (vercel.json, 14:00 UTC).
 *
 * Until then every entry point here resolves to 'unavailable' and the app
 * behaves exactly as it does today on local notifications alone. The settings
 * toggle stays visible so the flow is testable the moment credentials land —
 * enabling without Firebase fails closed with an explanatory toast, never a
 * stuck toggle.
 */

export type PushState = 'unavailable' | 'prompt' | 'denied' | 'granted' | 'registered';

export async function getPushState(): Promise<PushState> {
  if (!Capacitor.isNativePlatform()) return 'unavailable';
  try {
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'granted') return 'granted';
    if (receive === 'denied') return 'denied';
    return 'prompt';
  } catch {
    return 'unavailable';
  }
}

/**
 * Ask for the system permission AND register with FCM. Returns true only
 * when a token came back and was stored server-side. False covers every
 * failure uniformly — denied permission, missing google-services.json,
 * airplane mode — and the caller reports it as "not enabled" rather than
 * diagnosing Firebase from the UI.
 */
export async function enablePush(userId: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || !userId) return false;
  try {
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== 'granted') return false;
    const token = await waitForToken();
    if (!token) return false;
    await upsertToken(userId, token);
    return true;
  } catch {
    return false;
  }
}

export async function disablePush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const token = await currentToken().catch(() => null);
    if (token && userId && supabase) {
      await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
    }
  } catch {
    // Accessory cleanup; never surface.
  }
  try {
    await PushNotifications.removeAllListeners();
  } catch {
    // Not registered — nothing to remove.
  }
}

async function currentToken(): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (token: string | null) => {
      if (!done) {
        done = true;
        resolve(token);
      }
    };
    void PushNotifications.addListener('registration', ({ value }) => finish(value)).catch(() =>
      finish(null),
    );
    window.setTimeout(() => finish(null), 3000);
    void PushNotifications.register().catch(() => finish(null));
  });
}

/**
 * register() triggers an async 'registration' event rather than returning
 * the token, so bridge the event into a promise with a timeout. Without
 * Firebase configured the event never fires and this resolves null.
 */
async function waitForToken(timeoutMs = 8000): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    let handle: { remove: () => void | Promise<void> } | null = null;
    const finish = (token: string | null) => {
      if (settled) return;
      settled = true;
      if (handle) void handle.remove();
      resolve(token);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    void PushNotifications.addListener('registration', ({ value }) => {
      window.clearTimeout(timer);
      finish(value);
    })
      .then((listener) => {
        handle = listener;
        if (settled) void listener.remove();
      })
      .catch(() => {
        window.clearTimeout(timer);
        finish(null);
      });
    void PushNotifications.register().catch(() => {
      window.clearTimeout(timer);
      finish(null);
    });
  });
}

async function upsertToken(userId: string, token: string): Promise<void> {
  if (!supabase) throw new Error('Supabase unavailable');
  const { error } = await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: 'android', last_seen_at: new Date().toISOString() },
    { onConflict: 'token' },
  );
  if (error) throw error;
}

/**
 * Foreground presentation + token refresh. FCM shows its own heads-up when
 * the app is in the background; in the foreground nothing shows unless we
 * say so, so data messages are re-surfaced as local notifications. Returns
 * a cleanup function. Safe to call on every auth change — listeners are
 * namespaced per call and removed by the cleanup.
 */
export function initPushListeners(userId: string | null): () => void {
  if (!Capacitor.isNativePlatform()) return () => undefined;
  const cleanups: Array<() => void> = [];
  const track = (promise: Promise<{ remove: () => void | Promise<void> }>) => {
    void promise
      .then((handle) => {
        cleanups.push(() => {
          void handle.remove();
        });
      })
      .catch(() => undefined);
  };

  if (userId) {
    track(
      PushNotifications.addListener('registration', ({ value }) => {
        void upsertToken(userId, value).catch(() => undefined);
      }),
    );
    track(
      PushNotifications.addListener('registrationError', () => undefined),
    );
  }

  // A notification the user taps while the app is running should land
  // somewhere, not vanish: route its deep link if it carries one.
  track(
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const link = (action?.notification?.data as { link?: string } | undefined)?.link;
      if (link && link.startsWith('auramind://')) {
        window.location.href = link;
      }
    }),
  );

  // Foreground data message → visible local notification.
  track(
    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      if (!notification?.data) return;
      void LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 2_000_000_000),
            title: notification.title ?? 'AuraMind',
            body: notification.body ?? '',
            sound: 'default',
          },
        ],
      }).catch(() => undefined);
    }),
  );

  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {
        // Listener teardown must not throw out of an effect cleanup.
      }
    }
  };
}
