package com.auramind.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;

import androidx.activity.EdgeToEdge;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // No native action bar, ever. The launch/splash theme chain
        // (Theme.SplashScreen + Capacitor's late installSplashScreen) can
        // resolve to a theme WITH an action bar, which then sits above the
        // WebView showing the app label and stealing ~170px. Requesting
        // NO_TITLE before super pins the decor to bar-less before anything
        // else gets a vote; the hide() after super is the backstop.
        supportRequestWindowFeature(Window.FEATURE_NO_TITLE);
        setTheme(R.style.AppTheme_NoActionBar);
        // Registration MUST precede super.onCreate(). Capacitor builds the
        // bridge there and only picks up plugins registered beforehand;
        // registering after leaves the JS proxy resolving to nothing and every
        // call failing with "plugin is not implemented on android". Both of
        // these were registered after until now, so WearSync was almost
        // certainly never reachable either.
        registerPlugin(WearSyncPlugin.class);
        registerPlugin(ShareTargetPlugin.class);
        registerPlugin(BiometricAuthPlugin.class);
        registerPlugin(PlayEngagementPlugin.class);
        registerPlugin(ThemeColorsPlugin.class);
        registerPlugin(AuraDevicePlugin.class);
        registerPlugin(AuraSpeechPlugin.class);
        // Edge-to-edge BEFORE super.onCreate(): Capacitor calls setContentView
        // inside super, and the window flags must be set before content exists.
        // With targetSdk 35+ the system enforces this anyway; doing it here
        // keeps the bars transparent on every API level instead of only where
        // enforcement already applies. Content insets are handled in CSS via
        // env(safe-area-inset-*) — see styles/platform-styles.css.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
        // The gesture pill floats over our dark bottom nav. Let it stay
        // translucent rather than forcing the system to scrim behind it.
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setNavigationBarContrastEnforced(false);
        }
        // A cold-start share is delivered here, long before the web layer has
        // mounted. ShareTargetPlugin parks it so JS can pull it when ready.
        ShareTargetPlugin.handleIntent(getIntent());
    }

    /**
     * Shares that arrive while the app is already running.
     *
     * The activity is singleTask, so Android reuses this instance and routes
     * the new intent here instead of calling onCreate again. Without this a
     * second share would be silently dropped.
     */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        ShareTargetPlugin.handleIntent(intent);
    }

    /**
     * Refresh the home-screen widget when the app goes to the background.
     *
     * The web layer writes the due count into Capacitor Preferences as it
     * changes, but a widget cannot observe SharedPreferences from another
     * process, and the provider's updatePeriodMillis is 0 so the system never
     * polls it. Something has to tell it to redraw.
     *
     * onPause is the right moment rather than a Capacitor plugin call: the
     * widget is only ever looked at after leaving the app, so refreshing on
     * the way out means it is current exactly when it is seen, with no JS
     * bridge round-trip and nothing to keep in sync.
     */
    @Override
    public void onPause() {
        super.onPause();
        sendBroadcast(new Intent(AuraMindWidgetProvider.ACTION_REFRESH)
                .setPackage(getPackageName()));
        // The Quick Settings tile reads the same count, for the same reason.
        QuickReviewTileService.requestRefresh(this);
    }
}
