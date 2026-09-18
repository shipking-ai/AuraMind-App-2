package com.auramind.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Random;

/**
 * Speaks the study reminder aloud when it fires, even with the app closed.
 *
 * The visible notification is still posted by the LocalNotifications plugin
 * at the same wall-clock time; this alarm only adds the voice. Both are
 * rebuilt from the same settings by useReminderSync on every app start, so
 * they cannot drift apart for long.
 *
 * Deliberately polite:
 *  - silent when the ringer is on silent or vibrate, or Do Not Disturb is on;
 *  - plays on the notification stream, so the notification volume governs it;
 *  - asks for transient audio focus, so music ducks instead of talking over.
 *
 * Alarms do not survive a reboot, an app update, or a clock/zone change, so
 * those broadcasts reschedule from the stored settings.
 */
public class SpokenReminderReceiver extends BroadcastReceiver {

    static final String ACTION_SPEAK = "com.auramind.app.SPOKEN_REMINDER";
    private static final String PREFS = "auramind_spoken_reminder";
    private static final String KEY_CONFIG = "config";
    private static final int REQUEST_CODE = 7410;
    /** Give up well before the system's limit for a goAsync receiver. */
    private static final long SPEAK_TIMEOUT_MS = 25_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Context app = context.getApplicationContext();
        JSONObject config = load(app);
        if (config == null) return;

        if (!ACTION_SPEAK.equals(action)) {
            // Boot, package replaced, time or zone change.
            schedule(app, config);
            return;
        }

        // Queue the next occurrence first, so a failure below never ends the series.
        schedule(app, config);
        if (!mayMakeSound(app)) return;

        String message = pickMessage(config);
        if (message.isEmpty()) return;

        PendingResult result = goAsync();
        Handler main = new Handler(Looper.getMainLooper());
        AudioManager audio = (AudioManager) app.getSystemService(Context.AUDIO_SERVICE);
        AudioFocusRequest focus = requestFocus(audio);
        AuraSpeechEngine engine = new AuraSpeechEngine(app);

        final boolean[] done = {false};
        Runnable finish = () -> {
            if (done[0]) return;
            done[0] = true;
            engine.shutdown();
            abandonFocus(audio, focus);
            result.finish();
        };
        main.postDelayed(finish, SPEAK_TIMEOUT_MS);

        engine.speak(message, config.optString("voice", AuraSpeechEngine.VOICE_AUTO),
                config.optString("lang", "en-US"), 1f, 1f,
                AudioAttributes.USAGE_NOTIFICATION_EVENT,
                new AuraSpeechEngine.UtteranceCallback() {
                    @Override public void onStart() { }
                    @Override public void onFinish(boolean interrupted) { main.post(finish); }
                    @Override public void onError(String error) { main.post(finish); }
                });
    }

    /** Saves the settings (null clears them) and schedules or cancels the alarm. */
    static void saveAndSchedule(Context context, JSONObject config) {
        Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (config == null) {
            prefs.edit().remove(KEY_CONFIG).apply();
            alarms(app).cancel(pendingIntent(app));
            return;
        }
        prefs.edit().putString(KEY_CONFIG, config.toString()).apply();
        schedule(app, config);
    }

    private static JSONObject load(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_CONFIG, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    private static void schedule(Context context, JSONObject config) {
        long at = nextTrigger(config, System.currentTimeMillis());
        AlarmManager alarms = alarms(context);
        PendingIntent intent = pendingIntent(context);
        boolean exact = Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms();
        if (exact) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        } else {
            // Without the exact-alarm grant Android may defer this by a few
            // minutes; the notification it accompanies is deferred the same way.
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        }
    }

    /** Next local time matching hour:minute (and weekday, Sunday = 1), strictly after now. */
    static long nextTrigger(JSONObject config, long now) {
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(now);
        next.set(Calendar.HOUR_OF_DAY, config.optInt("hour", 9));
        next.set(Calendar.MINUTE, config.optInt("minute", 0));
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        int weekday = config.optInt("weekday", 0);
        if (weekday >= 1 && weekday <= 7) {
            int delta = (weekday - next.get(Calendar.DAY_OF_WEEK) + 7) % 7;
            next.add(Calendar.DAY_OF_YEAR, delta);
            if (next.getTimeInMillis() <= now) next.add(Calendar.DAY_OF_YEAR, 7);
        } else if (next.getTimeInMillis() <= now) {
            next.add(Calendar.DAY_OF_YEAR, 1);
        }
        return next.getTimeInMillis();
    }

    static String pickMessage(JSONObject config) {
        String chosen = config.optString("message", "").trim();
        if ("chosen".equals(config.optString("mode")) && !chosen.isEmpty()) return chosen;
        List<String> pool = new ArrayList<>();
        JSONArray messages = config.optJSONArray("messages");
        if (messages != null) {
            for (int i = 0; i < messages.length(); i++) {
                String line = messages.optString(i, "").trim();
                if (!line.isEmpty()) pool.add(line);
            }
        }
        if (pool.isEmpty()) return chosen;
        return pool.get(new Random().nextInt(pool.size()));
    }

    /** Never speak into a silenced phone. */
    private static boolean mayMakeSound(Context context) {
        AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audio == null || audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return false;
        NotificationManager notifications =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        return notifications == null
                || notifications.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL;
    }

    private static AudioFocusRequest requestFocus(AudioManager audio) {
        if (audio == null || Build.VERSION.SDK_INT < 26) return null;
        AudioFocusRequest request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                .build();
        audio.requestAudioFocus(request);
        return request;
    }

    private static void abandonFocus(AudioManager audio, AudioFocusRequest request) {
        if (audio != null && request != null && Build.VERSION.SDK_INT >= 26) {
            audio.abandonAudioFocusRequest(request);
        }
    }

    private static AlarmManager alarms(Context context) {
        return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    }

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, SpokenReminderReceiver.class).setAction(ACTION_SPEAK);
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
