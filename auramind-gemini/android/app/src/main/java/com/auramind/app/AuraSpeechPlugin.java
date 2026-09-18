package com.auramind.app;

import android.media.AudioAttributes;
import android.speech.tts.Voice;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

/**
 * AuraSpeech — native text-to-speech for the Android app.
 *
 * The WebView has no speechSynthesis, so read-aloud, voice study and slide
 * narration all route here on Android (see src/services/voice/speechOutput.ts).
 * Also stores and schedules the spoken study reminder, which has to speak
 * while the app is closed and therefore cannot live in JavaScript.
 */
@CapacitorPlugin(name = "AuraSpeech")
public class AuraSpeechPlugin extends Plugin {

    private AuraSpeechEngine engine;

    @Override
    public void load() {
        engine = new AuraSpeechEngine(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (engine != null) engine.shutdown();
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        engine.whenReady(tts -> {
            JSObject out = new JSObject();
            out.put("available", tts != null);
            out.put("defaultLanguage", Locale.getDefault().toLanguageTag());
            JSArray voices = new JSArray();
            if (tts != null) {
                List<Voice> usable = AuraSpeechEngine.usableVoices(tts);
                for (Voice voice : usable) {
                    JSObject item = new JSObject();
                    item.put("id", voice.getName());
                    item.put("lang", voice.getLocale().toLanguageTag());
                    item.put("localeName", voice.getLocale().getDisplayName());
                    item.put("network", voice.isNetworkConnectionRequired());
                    item.put("quality", voice.getQuality());
                    voices.put(item);
                }
            }
            out.put("voices", voices);
            call.resolve(out);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text == null || text.trim().isEmpty()) {
            JSObject out = new JSObject();
            out.put("interrupted", false);
            call.resolve(out);
            return;
        }
        String voice = call.getString("voice", AuraSpeechEngine.VOICE_AUTO);
        String lang = call.getString("lang", "en-US");
        float rate = call.getFloat("rate", 1f);
        float pitch = call.getFloat("pitch", 1f);

        engine.speak(text, voice, lang, rate, pitch, AudioAttributes.USAGE_MEDIA,
                new AuraSpeechEngine.UtteranceCallback() {
                    @Override
                    public void onStart() { }

                    @Override
                    public void onFinish(boolean interrupted) {
                        JSObject out = new JSObject();
                        out.put("interrupted", interrupted);
                        call.resolve(out);
                    }

                    @Override
                    public void onError(String message) {
                        call.reject(message, "speech_failed");
                    }
                });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        engine.stop();
        call.resolve();
    }

    /**
     * Stores the spoken-reminder settings and (re)schedules the alarm.
     * `enabled: false` cancels it. Times are local wall-clock.
     */
    @PluginMethod
    public void setSpokenReminder(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (!enabled) {
            SpokenReminderReceiver.saveAndSchedule(getContext(), null);
            call.resolve();
            return;
        }
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
            call.reject("hour and minute are required");
            return;
        }
        JSArray messages = call.getArray("messages", new JSArray());
        String message = call.getString("message", "");
        if ((messages == null || messages.length() == 0) && (message == null || message.trim().isEmpty())) {
            call.reject("at least one message is required");
            return;
        }
        try {
            JSONObject config = new JSONObject();
            config.put("hour", hour);
            config.put("minute", minute);
            Integer weekday = call.getInt("weekday");
            if (weekday != null && weekday >= 1 && weekday <= 7) config.put("weekday", weekday);
            config.put("mode", "chosen".equals(call.getString("mode")) ? "chosen" : "random");
            config.put("message", message == null ? "" : message.trim());
            config.put("messages", messages == null ? new JSONArray() : new JSONArray(messages.toString()));
            config.put("voice", call.getString("voice", AuraSpeechEngine.VOICE_AUTO));
            config.put("lang", call.getString("lang", "en-US"));
            config.put("title", call.getString("title", "AuraMind"));
            SpokenReminderReceiver.saveAndSchedule(getContext(), config);
            call.resolve();
        } catch (JSONException e) {
            call.reject("invalid reminder settings");
        }
    }

    /** Plays the reminder now, exactly as the alarm would (for "Test"). */
    @PluginMethod
    public void previewSpokenReminder(PluginCall call) {
        String text = call.getString("message", "");
        String voice = call.getString("voice", AuraSpeechEngine.VOICE_AUTO);
        String lang = call.getString("lang", "en-US");
        engine.speak(text, voice, lang, 1f, 1f, AudioAttributes.USAGE_NOTIFICATION_EVENT,
                new AuraSpeechEngine.UtteranceCallback() {
                    @Override public void onStart() { }
                    @Override public void onFinish(boolean interrupted) { call.resolve(); }
                    @Override public void onError(String message) { call.reject(message, "speech_failed"); }
                });
    }
}
