package com.auramind.app;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

/**
 * AuraListen — native speech recognition for voice study.
 *
 * Android System WebView has no SpeechRecognition, so spoken answers never
 * worked in the Android app. This wraps android.speech.SpeechRecognizer and
 * reports the same shape of events the Web Speech API does, so
 * src/services/voice/nativeRecognition.ts can hand useVoiceStudy an object
 * that behaves like the browser's recogniser.
 *
 * Events carry the session id passed to start(), because listeners are
 * plugin-wide: a stop followed by a quick restart must not let the old
 * session's late "end" close the new one.
 *
 * SpeechRecognizer must be created and driven on the main thread.
 */
@CapacitorPlugin(
        name = "AuraListen",
        permissions = @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone"))
public class AuraListenPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private String session = "";
    private long lastLevelAt = 0;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(out);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionResult");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphonePermissionResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            begin(call);
        } else {
            call.reject("Microphone permission denied", "not-allowed");
        }
    }

    private void begin(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("No speech recognition service on this device", "unavailable");
            return;
        }
        String nextSession = call.getString("session", "");
        String lang = call.getString("lang", "en-US");
        boolean partial = Boolean.TRUE.equals(call.getBoolean("interimResults", true));

        getActivity().runOnUiThread(() -> {
            // A new session replaces the old one, which is told it ended.
            endSession(true);
            session = nextSession;
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(listener);

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
            try {
                recognizer.startListening(intent);
                call.resolve();
            } catch (RuntimeException e) {
                endSession(false);
                call.reject("Could not start listening", "unknown");
            }
        });
    }

    /** Stop and deliver what was heard (like SpeechRecognition.stop()). */
    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
            call.resolve();
        });
    }

    /** Stop and discard (like SpeechRecognition.abort()). */
    @PluginMethod
    public void abort(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            endSession(true);
            call.resolve();
        });
    }

    /** Leaving the app releases the microphone rather than listening in the background. */
    @Override
    protected void handleOnPause() {
        getActivity().runOnUiThread(() -> endSession(true));
    }

    @Override
    protected void handleOnDestroy() {
        endSession(false);
    }

    /** Tears down the recogniser; announces "aborted" + "end" when asked. */
    private void endSession(boolean announce) {
        if (recognizer == null) return;
        SpeechRecognizer old = recognizer;
        recognizer = null;
        try {
            old.cancel();
            old.destroy();
        } catch (RuntimeException ignored) {
            // Service already gone.
        }
        if (announce) {
            emit("error", "error", "aborted");
            emit("end", null, null);
        }
    }

    private void emit(String event, String key, String value) {
        JSObject data = new JSObject();
        data.put("session", session);
        if (key != null) data.put(key, value);
        notifyListeners(event, data);
    }

    private static String firstResult(Bundle bundle) {
        if (bundle == null) return "";
        ArrayList<String> results = bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return results == null || results.isEmpty() || results.get(0) == null ? "" : results.get(0);
    }

    /** SpeechRecognizer error codes, in Web Speech API vocabulary. */
    static String webError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
            case 10: // ERROR_TOO_MANY_REQUESTS (API 31)
            case 11: // ERROR_SERVER_DISCONNECTED (API 31)
                return "network";
            case 12: // ERROR_LANGUAGE_NOT_SUPPORTED (API 31)
            case 13: // ERROR_LANGUAGE_UNAVAILABLE (API 31)
                return "language-not-supported";
            case SpeechRecognizer.ERROR_CLIENT:
                return "aborted";
            default:
                return "unknown";
        }
    }

    private final RecognitionListener listener = new RecognitionListener() {
        @Override
        public void onReadyForSpeech(Bundle params) {
            emit("start", null, null);
        }

        @Override
        public void onBeginningOfSpeech() { }

        @Override
        public void onRmsChanged(float rmsdB) {
            // ~10 updates a second is plenty for the orb and keeps the bridge quiet.
            long now = SystemClock.uptimeMillis();
            if (now - lastLevelAt < 100) return;
            lastLevelAt = now;
            // rmsdB runs roughly -2 (silence) to 10 (loud speech).
            float level = Math.max(0f, Math.min(1f, (rmsdB + 2f) / 12f));
            JSObject data = new JSObject();
            data.put("session", session);
            data.put("level", level);
            notifyListeners("level", data);
        }

        @Override
        public void onBufferReceived(byte[] buffer) { }

        @Override
        public void onEndOfSpeech() { }

        @Override
        public void onError(int error) {
            emit("error", "error", webError(error));
            emit("end", null, null);
            endSession(false);
        }

        @Override
        public void onResults(Bundle results) {
            emit("final", "text", firstResult(results));
            emit("end", null, null);
            endSession(false);
        }

        @Override
        public void onPartialResults(Bundle partialResults) {
            String text = firstResult(partialResults);
            if (!text.isEmpty()) emit("partial", "text", text);
        }

        @Override
        public void onEvent(int eventType, Bundle params) { }
    };
}
