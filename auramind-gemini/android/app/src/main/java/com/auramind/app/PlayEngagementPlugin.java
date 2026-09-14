package com.auramind.app;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * PlayEngagement — in-app review prompt and flexible in-app updates.
 *
 * Both flows are Play-quota-aware by design: Google decides whether the
 * review sheet actually shows, and flexible updates only apply when the new
 * version allows it. The JS layer adds its own politeness gates (studied
 * enough sessions, days since install, cooldown) so the native side stays
 * dumb: ask Play, report what happened.
 *
 * EVENTS
 *
 * - onUpdateDownloaded: fired when a flexible update finishes downloading.
 *   The app is still running the old version; JS should show a "Restart to
 *   update" affordance that calls completeUpdate().
 */
@CapacitorPlugin(name = "PlayEngagement")
public class PlayEngagementPlugin extends Plugin {

    private InstallStateUpdatedListener updateListener;

    // ── In-app review ───────────────────────────────────────────────

    @PluginMethod
    public void promptReview(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("no_activity", "No foreground activity for the review flow.");
            return;
        }
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(request -> {
            if (!request.isSuccessful() || request.getResult() == null) {
                call.reject("request_failed", "Play declined the review flow.");
                return;
            }
            ReviewInfo info = request.getResult();
            activity.runOnUiThread(() ->
                manager.launchReviewFlow(activity, info).addOnCompleteListener(launch -> {
                    JSObject out = new JSObject();
                    out.put("shown", launch.isSuccessful());
                    call.resolve(out);
                }));
        });
    }

    // ── Flexible in-app update ──────────────────────────────────────

    @PluginMethod
    public void checkUpdate(PluginCall call) {
        AppUpdateManager manager = AppUpdateManagerFactory.create(getContext());
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            JSObject out = new JSObject();
            boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
            out.put("available", available);
            out.put("flexibleAllowed",
                    available && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
            out.put("immediateAllowed",
                    available && info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
            out.put("versionCode", info.availableVersionCode());
            call.resolve(out);
        }).addOnFailureListener(e ->
            call.reject("check_failed", e.getMessage()));
    }

    @PluginMethod
    public void startFlexibleUpdate(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("no_activity", "No foreground activity for the update flow.");
            return;
        }
        AppUpdateManager manager = AppUpdateManagerFactory.create(getContext());
        manager.getAppUpdateInfo().addOnSuccessListener(info -> {
            if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE
                    || !info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                call.reject("not_available", "No flexible update is available.");
                return;
            }
            unregisterUpdateListener(manager);
            updateListener = state -> {
                if (state.installStatus() == InstallStatus.DOWNLOADED) {
                    notifyListeners("onUpdateDownloaded", new JSObject(), true);
                }
            };
            manager.registerListener(updateListener);
            activity.runOnUiThread(() -> {
                try {
                    manager.startUpdateFlowForResult(
                            info,
                            activity,
                            AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build(),
                            7301);
                    call.resolve(new JSObject().put("started", true));
                } catch (Exception e) {
                    unregisterUpdateListener(manager);
                    call.reject("start_failed", e.getMessage());
                }
            });
        }).addOnFailureListener(e ->
            call.reject("check_failed", e.getMessage()));
    }

    @PluginMethod
    public void completeUpdate(PluginCall call) {
        try {
            AppUpdateManagerFactory.create(getContext()).completeUpdate();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("complete_failed", e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            unregisterUpdateListener(AppUpdateManagerFactory.create(getContext()));
        } catch (Exception ignored) {
            // Manager creation can fail when Play is absent (sideloaded debug
            // builds); there is simply nothing to unregister then.
        }
    }

    private void unregisterUpdateListener(AppUpdateManager manager) {
        if (updateListener != null) {
            try {
                manager.unregisterListener(updateListener);
            } catch (Exception ignored) {
            }
            updateListener = null;
        }
    }
}
