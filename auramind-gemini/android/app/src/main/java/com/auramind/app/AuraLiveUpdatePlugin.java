package com.auramind.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/**
 * AuraLiveUpdate — the study session as an Android 16 Live Update.
 *
 * Android 16 (API 36) promotes an ongoing notification built with
 * ProgressStyle to the status bar chip and the top of the lock screen, so a
 * session stays glanceable while the user is in another app: a progress bar
 * of the cards in the session, a point for every card that was forgotten and
 * will come back, and "8 left" in the chip itself.
 *
 * Below API 36 the same call posts an ordinary ongoing progress notification,
 * which is what those releases can show. Either way it is a mirror of session
 * state — tapping it deep-links back into the session and nothing else here
 * changes a card.
 */
@CapacitorPlugin(name = "AuraLiveUpdate")
public class AuraLiveUpdatePlugin extends Plugin {

    private static final String CHANNEL_ID = "auramind_study_session";
    private static final int NOTIFICATION_ID = 7301;
    /** Android 16. Named here so the file compiles against older SDKs too. */
    private static final int ANDROID_16 = 36;

    private static final int COLOR_TRACK = Color.parseColor("#7C3AED");
    private static final int COLOR_AGAIN = Color.parseColor("#FB7185");

    private static boolean channelReady = false;

    /** Whether this device can show a session as a Live Update at all. */
    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", Build.VERSION.SDK_INT >= ANDROID_16);
        result.put("promoted", canPromote(getContext()));
        call.resolve(result);
    }

    /** Start (or replace) the session notification. */
    @PluginMethod
    public void start(PluginCall call) {
        post(call, true);
    }

    /** Move the bar; cheap enough to call on every card. */
    @PluginMethod
    public void update(PluginCall call) {
        post(call, false);
    }

    /** End the session: the Live Update must not outlive it. */
    @PluginMethod
    public void end(PluginCall call) {
        NotificationManager manager = manager(getContext());
        if (manager != null) {
            manager.cancel(NOTIFICATION_ID);
        }
        call.resolve();
    }

    private void post(PluginCall call, boolean fresh) {
        final boolean posted = postSession(
                getContext(),
                call.getString("deckTitle"),
                Math.max(1, call.getInt("total", 1)),
                call.getInt("done", 0),
                againPositions(call),
                call.getString("deepLink"),
                fresh);
        call.resolve(new JSObject().put("posted", posted).put("promoted", canPromote(getContext())));
    }

    /** The 1-based card positions graded Again, as sent by the web layer. */
    private static List<Integer> againPositions(PluginCall call) {
        List<Integer> positions = new ArrayList<>();
        JSArray raw = call.getArray("againAt");
        if (raw == null) return positions;
        try {
            for (Object entry : raw.toList()) {
                if (entry instanceof Number) positions.add(((Number) entry).intValue());
            }
        } catch (JSONException ignored) {
            // A malformed array just means no dots.
        }
        return positions;
    }

    /**
     * Build and post the session notification. Static and PluginCall-free so
     * the notification can be exercised without the web layer.
     */
    static boolean postSession(Context context, String deckTitle, int total, int done,
                               List<Integer> againAt, String deepLink, boolean fresh) {
        NotificationManager manager = manager(context);
        if (manager == null || !hasNotificationPermission(context)) return false;

        final String deck = value(deckTitle, "Study session");
        final int safeTotal = Math.max(1, total);
        final int safeDone = clamp(done, 0, safeTotal);
        final String link = value(deepLink, "auramind://app/dashboard/study");

        ensureChannel(manager);

        Notification.Builder builder = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_shortcut_review)
                .setContentTitle(deck)
                .setContentText(remaining(safeTotal - safeDone))
                .setContentIntent(openIntent(context, link))
                .setOngoing(true)
                // A fresh session may alert once; updates never do.
                .setOnlyAlertOnce(!fresh)
                .setCategory(Notification.CATEGORY_PROGRESS)
                .setColor(COLOR_TRACK)
                .setColorized(true);

        if (Build.VERSION.SDK_INT >= ANDROID_16) {
            applyProgressStyle(context, builder, safeTotal, safeDone, againAt);
        } else {
            builder.setProgress(safeTotal, safeDone, false);
        }

        manager.notify(NOTIFICATION_ID, builder.build());
        return true;
    }

    /**
     * The Android 16 shape: a segmented bar, a point for each card that came
     * back as Again, and a short chip label for the status bar.
     */
    @android.annotation.TargetApi(ANDROID_16)
    private static void applyProgressStyle(Context context, Notification.Builder builder,
                                           int total, int done, List<Integer> againAt) {
        Notification.ProgressStyle style = new Notification.ProgressStyle()
                .setProgress(done)
                .setStyledByProgress(false)
                .setProgressTrackerIcon(Icon.createWithResource(context, R.drawable.ic_shortcut_review));

        List<Notification.ProgressStyle.Segment> segments = new ArrayList<>();
        Notification.ProgressStyle.Segment segment = new Notification.ProgressStyle.Segment(total);
        segment.setColor(COLOR_TRACK);
        segments.add(segment);
        style.setProgressSegments(segments);

        if (againAt != null && !againAt.isEmpty()) {
            // A dot where each forgotten card sat in the queue: the tracker
            // says how far along the session is, the dots behind it say how
            // much of it is coming back.
            List<Notification.ProgressStyle.Point> points = new ArrayList<>();
            for (Integer at : againAt) {
                if (at == null) continue;
                Notification.ProgressStyle.Point point =
                        new Notification.ProgressStyle.Point(clamp(at, 0, total));
                point.setColor(COLOR_AGAIN);
                points.add(point);
            }
            if (!points.isEmpty()) style.setProgressPoints(points);
        }

        builder.setStyle(style)
                .setShortCriticalText(total - done > 0 ? (total - done) + " left" : "Done");
        requestPromotion(builder);
    }

    /**
     * Ask for the status-bar chip. setRequestPromotedOngoing arrived in API
     * 36.1 (Android 16 QPR1) while the project compiles against 36, so it is
     * called reflectively: on a 36.0 device the notification is simply an
     * ordinary ongoing one, which is all that release can show.
     */
    private static void requestPromotion(Notification.Builder builder) {
        try {
            Notification.Builder.class
                    .getMethod("setRequestPromotedOngoing", boolean.class)
                    .invoke(builder, true);
        } catch (ReflectiveOperationException | IllegalArgumentException ignored) {
            // Older Android 16 build: ongoing, just not promoted.
        }
    }

    private static void ensureChannel(NotificationManager manager) {
        if (channelReady) return;
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "Study sessions", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("Shows how far along the current study session is.");
        channel.setShowBadge(false);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
        channelReady = true;
    }

    private static PendingIntent openIntent(Context context, String deepLink) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
        intent.setClass(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @android.annotation.TargetApi(ANDROID_16)
    private static boolean canPromote(Context context) {
        if (Build.VERSION.SDK_INT < ANDROID_16) return false;
        NotificationManager manager = manager(context);
        return manager != null && manager.canPostPromotedNotifications();
    }

    private static boolean hasNotificationPermission(Context context) {
        if (Build.VERSION.SDK_INT < 33) return true;
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static NotificationManager manager(Context context) {
        return context == null
                ? null
                : (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static String remaining(int left) {
        if (left <= 0) return "Session complete";
        return left == 1 ? "1 card left" : left + " cards left";
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static String value(String candidate, String fallback) {
        return candidate == null || candidate.trim().isEmpty() ? fallback : candidate.trim();
    }
}
