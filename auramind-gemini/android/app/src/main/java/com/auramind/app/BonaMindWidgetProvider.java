package com.auramind.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Home-screen widget showing how many cards are due.
 *
 * WHY A CLASSIC APPWIDGET AND NOT GLANCE
 *
 * Glance is the modern answer, but it requires Kotlin and Compose. This
 * module is plain Java with neither, so adopting it would mean adding the
 * Kotlin plugin, the Compose compiler and the Glance dependency to a
 * release build that is otherwise ready to ship. RemoteViews needs nothing
 * new, works on every supported API level, and a due-count widget is not
 * complex enough to justify that trade.
 *
 * WHERE THE DATA COMES FROM
 *
 * The web layer already persists through @capacitor/preferences, which is
 * SharedPreferences under the hood ("CapacitorStorage"). The app writes the
 * due count there and broadcasts an update; this provider only reads. That
 * keeps a single source of truth in the TypeScript that already computes
 * due counts, instead of reimplementing FSRS scheduling in Java.
 *
 * The widget is intentionally readable when empty: a brand-new install with
 * no stored value shows a real invitation rather than "0", which would look
 * broken on a home screen.
 */
public class BonaMindWidgetProvider extends AppWidgetProvider {

    /** Key suffixes the web layer writes (src/lib/widgetBridge.ts); read through WidgetPrefs. */
    private static final String KEY_DUE = "widget_due";
    private static final String KEY_DECK = "widget_deck";
    private static final String KEY_STREAK = "widget_streak";

    /** Broadcast the app sends after writing new values. */
    public static final String ACTION_REFRESH = "com.auramind.app.WIDGET_REFRESH";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            // BOOT_COMPLETED redraws from the persisted prefs: without it the
            // widget shows its initial layout until the app is opened once.
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            int[] ids = manager.getAppWidgetIds(
                    new ComponentName(context, AuraMindWidgetProvider.class)); // legacy-name: ok
            onUpdate(context, manager, ids);
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            manager.updateAppWidget(id, buildViews(context, manager, id));
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager manager, int appWidgetId, android.os.Bundle newOptions) {
        super.onAppWidgetOptionsChanged(context, manager, appWidgetId, newOptions);
        manager.updateAppWidget(appWidgetId, buildViews(context, manager, appWidgetId));
    }

    private RemoteViews buildViews(Context context, AppWidgetManager manager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(WidgetPrefs.PREFS, Context.MODE_PRIVATE);

        // Capacitor stores everything as strings, and a fresh install has no
        // entry at all, so parse defensively rather than assuming an int.
        int due = 0;
        try {
            String raw = WidgetPrefs.read(prefs, KEY_DUE, "0");
            if (raw != null && !raw.isEmpty()) {
                due = Integer.parseInt(raw.replaceAll("\"", "").trim());
            }
        } catch (NumberFormatException ignored) {
            due = 0;
        }

        String deck = WidgetPrefs.read(prefs, KEY_DECK, null);
        if (deck != null) {
            deck = deck.replaceAll("^\"|\"$", "");
        }

        int streak = 0;
        try {
            String rawStreak = WidgetPrefs.read(prefs, KEY_STREAK, "0");
            if (rawStreak != null && !rawStreak.isEmpty()) {
                streak = Integer.parseInt(rawStreak.replaceAll("\"", "").trim());
            }
        } catch (NumberFormatException ignored) {
            streak = 0;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_bonamind);
        views.setTextViewText(R.id.widget_count, String.valueOf(due));

        if (due == 0) {
            views.setTextViewText(R.id.widget_label, "You're all caught up");
            views.setTextViewText(R.id.widget_cta, "Add cards");
        } else {
            views.setTextViewText(R.id.widget_label, due == 1 ? "card due" : "cards due");
            views.setTextViewText(R.id.widget_cta,
                    deck != null && !deck.isEmpty() ? deck : "Start review");
        }

        if (streak > 0) {
            views.setTextViewText(R.id.widget_streak,
                    streak == 1 ? "1 day streak" : streak + " day streak");
            views.setViewVisibility(R.id.widget_streak, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_streak, android.view.View.GONE);
        }

        // Compact mode for small/resized widgets: the count and label carry
        // the meaning, so the CTA and streak yield first rather than clipping.
        try {
            android.os.Bundle options = manager.getAppWidgetOptions(appWidgetId);
            int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 999);
            int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 999);
            boolean compact = minWidth < 150 || minHeight < 130;
            views.setViewVisibility(R.id.widget_cta,
                    compact ? android.view.View.GONE : android.view.View.VISIBLE);
            if (compact) {
                views.setViewVisibility(R.id.widget_streak, android.view.View.GONE);
            }
        } catch (Exception ignored) {
            // Options are advisory; a full layout is the safe fallback.
        }

        // Tapping anywhere deep-links straight into the review queue via the
        // same bonamind:// scheme the launcher shortcuts use — one tap from
        // the home screen to studying. FLAG_IMMUTABLE is required from API 31
        // and harmless below it. The request code is the widget id so two
        // widgets do not share (and clobber) one PendingIntent.
        Intent launch = new Intent(Intent.ACTION_VIEW,
                android.net.Uri.parse("bonamind://app/dashboard/study"));
        launch.setClass(context, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
                context, appWidgetId, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        return views;
    }
}
