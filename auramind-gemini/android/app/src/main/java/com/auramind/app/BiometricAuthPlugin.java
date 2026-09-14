package com.auramind.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.concurrent.Executor;

/**
 * BiometricAuth — device biometrics (fingerprint / face / iris) plus
 * hardware-backed credential storage for the AuraMind Android app.
 *
 * WHY FIRST-PARTY INSTEAD OF A COMMUNITY PLUGIN
 *
 * The two community options either pull their own activity subclasses or lag
 * Capacitor major versions. androidx.biometric is a ~200KB Jetpack library
 * with a stable API, and the surface we need is four methods, so owning the
 * twenty lines of prompt code costs less than tracking someone else's.
 *
 * METHODS
 *
 * - isAvailable(): whether the device can do biometric auth right now, and
 *   which modality it has. Never prompts.
 * - verifyIdentity({title, subtitle, description}): shows the system
 *   biometric sheet. Resolves on success; rejects with code "cancelled",
 *   "lockout" or "failed" otherwise. Only one prompt at a time — a second
 *   call while one is showing is rejected immediately.
 * - setCredentials/getCredentials/deleteCredentials({server, ...}): session
 *   tokens parked in EncryptedSharedPreferences (AES256-GCM, Android Keystore
 *   backed), keyed by server. The web layer writes the Supabase session here
 *   so a reinstall-free biometric unlock can restore it without a password.
 */
@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {

    private static final String CREDS_FILE = "auramind_biometric_creds";

    /** The prompt currently on screen, if any. BiometricPrompt is one-shot. */
    private PluginCall pendingAuth;

    // ── Availability ────────────────────────────────────────────────

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context ctx = getContext();
        int status = BiometricManager.from(ctx)
                .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG
                        | BiometricManager.Authenticators.BIOMETRIC_WEAK);

        JSObject out = new JSObject();
        out.put("isAvailable", status == BiometricManager.BIOMETRIC_SUCCESS);
        out.put("biometryType", detectType(ctx));
        if (status != BiometricManager.BIOMETRIC_SUCCESS) {
            out.put("reason", describeStatus(status));
        }
        call.resolve(out);
    }

    private String detectType(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        boolean finger = pm.hasSystemFeature(PackageManager.FEATURE_FINGERPRINT);
        boolean face = pm.hasSystemFeature(PackageManager.FEATURE_FACE);
        boolean iris = pm.hasSystemFeature(PackageManager.FEATURE_IRIS);
        int count = (finger ? 1 : 0) + (face ? 1 : 0) + (iris ? 1 : 0);
        if (count > 1) return "multiple";
        if (finger) return "fingerprint";
        if (face) return "face";
        if (iris) return "iris";
        return "none";
    }

    private String describeStatus(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "no_hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "temporarily_unavailable";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "not_enrolled";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "security_update_required";
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
                return "unsupported_os_version";
            case BiometricManager.BIOMETRIC_STATUS_UNKNOWN:
            default:
                return "unknown";
        }
    }

    // ── Prompt ──────────────────────────────────────────────────────

    @PluginMethod
    public void verifyIdentity(PluginCall call) {
        if (pendingAuth != null) {
            call.reject("already_in_progress",
                    "A biometric prompt is already showing.");
            return;
        }
        if (getActivity() == null) {
            call.reject("no_activity", "No foreground activity for the prompt.");
            return;
        }

        pendingAuth = call;
        String title = call.getString("title", "Unlock AuraMind");
        String subtitle = call.getString("subtitle", null);
        String description = call.getString("description",
                call.getString("reason", "Confirm it's you to continue."));

        BiometricPrompt.PromptInfo.Builder info =
                new BiometricPrompt.PromptInfo.Builder()
                        .setTitle(title)
                        .setNegativeButtonText("Cancel");
        if (subtitle != null) info.setSubtitle(subtitle);
        if (description != null) info.setDescription(description);

        Executor executor = ContextCompat.getMainExecutor(getActivity());
        BiometricPrompt prompt = new BiometricPrompt(
                getActivity(), executor, new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(
                            @NonNull BiometricPrompt.AuthenticationResult result) {
                        finishPending(true, null, null);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        // A failed fingerprint (dirty sensor, wrong finger) is
                        // NOT an error — the sheet stays up for another try and
                        // this callback is not invoked for it. Errors here mean
                        // the sheet went away: cancel, lockout, or a real fault.
                        String code = "failed";
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_CANCELED) {
                            code = "cancelled";
                        } else if (errorCode == BiometricPrompt.ERROR_LOCKOUT
                                || errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT) {
                            code = "lockout";
                        }
                        finishPending(false, code, errString.toString());
                    }
                });

        getActivity().runOnUiThread(() -> {
            try {
                prompt.authenticate(info.build());
            } catch (Exception e) {
                finishPending(false, "failed", e.getMessage());
            }
        });
    }

    private void finishPending(boolean success, String code, String message) {
        PluginCall call = pendingAuth;
        pendingAuth = null;
        if (call == null) return;
        if (success) {
            JSObject out = new JSObject();
            out.put("success", true);
            call.resolve(out);
        } else {
            call.reject(code == null ? "failed" : code,
                    message == null ? "Authentication failed." : message);
        }
    }

    // ── Credential vault ────────────────────────────────────────────

    private SharedPreferences vault() throws Exception {
        Context ctx = getContext();
        MasterKey masterKey = new MasterKey.Builder(ctx)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
        return EncryptedSharedPreferences.create(
                ctx,
                CREDS_FILE,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
    }

    @PluginMethod
    public void setCredentials(PluginCall call) {
        String server = call.getString("server");
        String username = call.getString("username");
        String password = call.getString("password");
        if (server == null || username == null || password == null) {
            call.reject("invalid_args", "username, password and server are required.");
            return;
        }
        try {
            JSONObject stored = new JSONObject()
                    .put("username", username)
                    .put("password", password);
            vault().edit().putString(server, stored.toString()).apply();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("vault_error", e.getMessage());
        }
    }

    @PluginMethod
    public void getCredentials(PluginCall call) {
        String server = call.getString("server");
        if (server == null) {
            call.reject("invalid_args", "server is required.");
            return;
        }
        try {
            String raw = vault().getString(server, null);
            if (raw == null) {
                call.reject("not_found", "No stored credentials for this server.");
                return;
            }
            JSONObject stored = new JSONObject(raw);
            JSObject out = new JSObject();
            out.put("username", stored.optString("username", ""));
            out.put("password", stored.optString("password", ""));
            call.resolve(out);
        } catch (Exception e) {
            call.reject("vault_error", e.getMessage());
        }
    }

    @PluginMethod
    public void deleteCredentials(PluginCall call) {
        String server = call.getString("server");
        if (server == null) {
            call.reject("invalid_args", "server is required.");
            return;
        }
        try {
            vault().edit().remove(server).apply();
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("vault_error", e.getMessage());
        }
    }
}
