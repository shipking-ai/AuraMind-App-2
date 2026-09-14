package com.auramind.app;

import android.content.res.Configuration;
import android.content.res.Resources;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * ThemeColors — Material You dynamic color for the web layer.
 *
 * A WebView cannot see the system's wallpaper-derived palette; only native
 * code can read it. This plugin bridges the gap: on Android 12+ it returns
 * the tonal spots Material 3 builds its dark scheme from, so the Android
 * shell can tint itself with the user's wallpaper instead of a fixed violet.
 *
 * The mapping follows the M3 dark baseline (primary = A1-80, container =
 * A1-30, secondary = A2-80, tertiary = A3-80, surface = N1-10) and the light
 * baseline when the device is in light mode (40/90/40/40/N-95). The JS side
 * applies them as CSS variables with the brand violet as the fallback, so a
 * device without dynamic color (or a failed read) renders exactly as before.
 */
@CapacitorPlugin(name = "ThemeColors")
public class ThemeColorsPlugin extends Plugin {

    @PluginMethod
    public void getDynamicColors(PluginCall call) {
        if (Build.VERSION.SDK_INT < 31) {
            call.reject("unsupported", "Dynamic color needs Android 12+.");
            return;
        }
        // The web app has its own theme (dark / light / system) that does not
        // necessarily match the OS uiMode, and the palette must match what is
        // actually on screen. The JS side passes its resolved mode; only when
        // it does not (older web builds) do we fall back to the system mode.
        Boolean nightOpt = call.getBoolean("night", null);
        boolean night = nightOpt != null ? nightOpt
                : (getContext().getResources().getConfiguration().uiMode
                        & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
        try {
            Resources res = getContext().getResources();
            JSObject out = new JSObject();
            out.put("available", true);
            out.put("night", night);
            if (night) {
                out.put("primary", tone(res, android.R.color.system_accent1_200));
                out.put("primaryContainer", tone(res, android.R.color.system_accent1_700));
                out.put("secondary", tone(res, android.R.color.system_accent2_200));
                out.put("tertiary", tone(res, android.R.color.system_accent3_200));
                out.put("surface", tone(res, android.R.color.system_neutral1_900));
            } else {
                out.put("primary", tone(res, android.R.color.system_accent1_600));
                out.put("primaryContainer", tone(res, android.R.color.system_accent1_100));
                out.put("secondary", tone(res, android.R.color.system_accent2_600));
                out.put("tertiary", tone(res, android.R.color.system_accent3_600));
                out.put("surface", tone(res, android.R.color.system_neutral1_50));
            }
            call.resolve(out);
        } catch (Resources.NotFoundException e) {
            // Some OEM builds strip the dynamic overlays. Brand violet then.
            call.reject("unavailable", "No dynamic palette on this device.");
        }
    }

    private static String tone(Resources res, int id) {
        int color = res.getColor(id, null);
        return String.format("#%06X", 0xFFFFFF & color);
    }
}
