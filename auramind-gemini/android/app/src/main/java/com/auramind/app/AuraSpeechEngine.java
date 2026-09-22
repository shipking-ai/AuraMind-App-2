package com.auramind.app;

import android.content.Context;
import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * One Android TextToSpeech engine plus the voice rules AuraMind uses.
 *
 * Exists because Android System WebView has no speechSynthesis at all:
 * `window.speechSynthesis` is undefined inside the Capacitor app, so every
 * read-aloud feature was silent on Android. Both the in-app plugin and the
 * spoken-reminder receiver speak through this class so voice choice
 * ("auto", "random" or a voice id) means the same thing everywhere.
 *
 * TextToSpeech binds to the engine's service, so it must be created with an
 * application context: a BroadcastReceiver's own context is not allowed to
 * bind.
 */
final class AuraSpeechEngine {

    interface ReadyCallback {
        void onReady(TextToSpeech tts);
    }

    interface UtteranceCallback {
        void onStart();
        /** interrupted = stopped or replaced by a newer utterance. */
        void onFinish(boolean interrupted);
        void onError(String message);
    }

    static final String VOICE_AUTO = "auto";
    static final String VOICE_RANDOM = "random";

    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<ReadyCallback> waiting = new ArrayList<>();
    private final Map<String, Pending> pending = new HashMap<>();
    private final Random random = new Random();

    private TextToSpeech tts;
    /** 0 = initialising, 1 = ready, -1 = failed. */
    private int state = 0;
    private int sequence = 0;

    private static final class Pending {
        final UtteranceCallback callback;
        final String lastChunkId;
        boolean started;

        Pending(UtteranceCallback callback, String lastChunkId) {
            this.callback = callback;
            this.lastChunkId = lastChunkId;
        }
    }

    AuraSpeechEngine(Context context) {
        tts = new TextToSpeech(context.getApplicationContext(), status -> main.post(() -> {
            state = status == TextToSpeech.SUCCESS ? 1 : -1;
            if (state == 1) tts.setOnUtteranceProgressListener(progressListener);
            List<ReadyCallback> ready = new ArrayList<>(waiting);
            waiting.clear();
            for (ReadyCallback callback : ready) callback.onReady(state == 1 ? tts : null);
        }));
    }

    /** Runs on the main thread with the engine, or null if it failed to start. */
    void whenReady(ReadyCallback callback) {
        main.post(() -> {
            if (state == 0) {
                waiting.add(callback);
            } else {
                callback.onReady(state == 1 ? tts : null);
            }
        });
    }

    /** Installed voices usable right now, local ones first, sorted by language. */
    static List<Voice> usableVoices(TextToSpeech tts) {
        List<Voice> out = new ArrayList<>();
        Set<Voice> voices;
        try {
            voices = tts.getVoices();
        } catch (RuntimeException e) {
            voices = null;
        }
        if (voices == null) return out;
        for (Voice voice : voices) {
            Set<String> features = voice.getFeatures();
            if (features != null && features.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) {
                continue;
            }
            out.add(voice);
        }
        Collections.sort(out, (a, b) -> {
            if (a.isNetworkConnectionRequired() != b.isNetworkConnectionRequired()) {
                return a.isNetworkConnectionRequired() ? 1 : -1;
            }
            int byLocale = a.getLocale().toLanguageTag().compareTo(b.getLocale().toLanguageTag());
            return byLocale != 0 ? byLocale : a.getName().compareTo(b.getName());
        });
        return out;
    }

    /**
     * Applies a voice choice. "auto" keeps the engine default for the
     * language; "random" picks among installed offline voices in that
     * language so a reminder never depends on a connection.
     */
    void applyVoice(TextToSpeech tts, String choice, String language) {
        Locale locale = Locale.forLanguageTag(language == null || language.isEmpty() ? "en-US" : language);
        List<Voice> voices = usableVoices(tts);

        if (choice != null && !choice.isEmpty() && !VOICE_AUTO.equals(choice) && !VOICE_RANDOM.equals(choice)) {
            for (Voice voice : voices) {
                if (voice.getName().equals(choice)) {
                    tts.setVoice(voice);
                    return;
                }
            }
        }

        if (VOICE_RANDOM.equals(choice)) {
            // Only the best quality tier the engine offers offline, so a
            // random pick never lands on an old low-fidelity voice.
            int bestQuality = Integer.MIN_VALUE;
            for (Voice voice : voices) {
                if (!voice.isNetworkConnectionRequired()
                        && voice.getLocale().getLanguage().equals(locale.getLanguage())) {
                    bestQuality = Math.max(bestQuality, voice.getQuality());
                }
            }
            List<Voice> candidates = new ArrayList<>();
            for (Voice voice : voices) {
                if (!voice.isNetworkConnectionRequired()
                        && voice.getLocale().getLanguage().equals(locale.getLanguage())
                        && voice.getQuality() == bestQuality) {
                    candidates.add(voice);
                }
            }
            if (!candidates.isEmpty()) {
                tts.setVoice(candidates.get(random.nextInt(candidates.size())));
                return;
            }
        }

        // Auto, or a stored voice that has since been uninstalled.
        int result = tts.setLanguage(locale);
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            tts.setLanguage(Locale.getDefault());
        }
    }

    /**
     * Speaks text, replacing anything already playing. Long text is split at
     * sentence boundaries because engines reject input past
     * getMaxSpeechInputLength() (about 4000 characters).
     */
    void speak(String text, String voice, String language, float rate, float pitch,
               int audioUsage, UtteranceCallback callback) {
        whenReady(engine -> {
            if (engine == null) {
                callback.onError("Text-to-speech is not available on this device.");
                return;
            }
            stopInternal(engine);
            applyVoice(engine, voice, language);
            engine.setSpeechRate(clamp(rate, 0.3f, 2.5f));
            engine.setPitch(clamp(pitch, 0.5f, 2.0f));
            engine.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(audioUsage)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());

            List<String> chunks = chunk(text, Math.max(200, TextToSpeech.getMaxSpeechInputLength() - 100));
            if (chunks.isEmpty()) {
                callback.onFinish(false);
                return;
            }
            String base = "aura-" + (++sequence);
            String lastId = base + "-" + (chunks.size() - 1);
            Pending entry = new Pending(callback, lastId);
            for (int i = 0; i < chunks.size(); i++) {
                String id = base + "-" + i;
                pending.put(id, entry);
                int queued = engine.speak(chunks.get(i),
                        i == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, new Bundle(), id);
                if (queued != TextToSpeech.SUCCESS) {
                    removeEntry(entry);
                    callback.onError("The speech engine rejected the text.");
                    return;
                }
            }
        });
    }

    void stop() {
        whenReady(engine -> {
            if (engine != null) stopInternal(engine);
        });
    }

    void shutdown() {
        main.post(() -> {
            finishAll(true);
            waiting.clear();
            if (tts != null) {
                try {
                    tts.stop();
                    tts.shutdown();
                } catch (RuntimeException ignored) {
                    // Already unbound.
                }
                tts = null;
            }
            state = -1;
        });
    }

    private void stopInternal(TextToSpeech engine) {
        try {
            engine.stop();
        } catch (RuntimeException ignored) {
            // Engine died; the pending callbacks are settled below either way.
        }
        finishAll(true);
    }

    private void finishAll(boolean interrupted) {
        List<Pending> entries = new ArrayList<>(new java.util.LinkedHashSet<>(pending.values()));
        pending.clear();
        for (Pending entry : entries) entry.callback.onFinish(interrupted);
    }

    private void removeEntry(Pending entry) {
        pending.values().removeIf(value -> value == entry);
    }

    private final UtteranceProgressListener progressListener = new UtteranceProgressListener() {
        @Override
        public void onStart(String utteranceId) {
            main.post(() -> {
                Pending entry = pending.get(utteranceId);
                if (entry != null && !entry.started) {
                    entry.started = true;
                    entry.callback.onStart();
                }
            });
        }

        @Override
        public void onDone(String utteranceId) {
            main.post(() -> {
                Pending entry = pending.remove(utteranceId);
                if (entry != null && utteranceId.equals(entry.lastChunkId)) {
                    removeEntry(entry);
                    entry.callback.onFinish(false);
                }
            });
        }

        @Override
        public void onStop(String utteranceId, boolean interrupted) {
            main.post(() -> {
                Pending entry = pending.remove(utteranceId);
                if (entry != null) {
                    removeEntry(entry);
                    entry.callback.onFinish(true);
                }
            });
        }

        @Override
        @SuppressWarnings("deprecation")
        public void onError(String utteranceId) {
            main.post(() -> {
                Pending entry = pending.remove(utteranceId);
                if (entry != null) {
                    removeEntry(entry);
                    entry.callback.onError("Speech failed.");
                }
            });
        }

        @Override
        public void onError(String utteranceId, int errorCode) {
            onError(utteranceId);
        }
    };

    static List<String> chunk(String text, int max) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        String rest = text.replaceAll("\\s+", " ").trim();
        while (!rest.isEmpty()) {
            if (rest.length() <= max) {
                out.add(rest);
                break;
            }
            int cut = -1;
            for (String mark : new String[] {". ", "! ", "? ", "; ", ", ", " "}) {
                int at = rest.lastIndexOf(mark, max);
                if (at > max / 2) {
                    cut = at + mark.length();
                    break;
                }
            }
            if (cut <= 0) cut = max;
            out.add(rest.substring(0, cut).trim());
            rest = rest.substring(cut).trim();
        }
        return out;
    }

    private static float clamp(float value, float min, float max) {
        if (Float.isNaN(value)) return 1f;
        return Math.max(min, Math.min(max, value));
    }
}
