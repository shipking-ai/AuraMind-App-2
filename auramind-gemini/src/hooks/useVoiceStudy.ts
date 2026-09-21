/**
 * useVoiceStudy — hands-free study: speaks prompts, listens for answers.
 *
 * Speaking goes through services/voice/speechOutput.ts (native TTS in the
 * Android app, Web Speech elsewhere, honouring the chosen voice). Listening
 * and browser-quirk handling live in services/voice/speechEngine.ts; this
 * hook is the React binding. Notable behaviour:
 *
 *   - `ttsSupported` and `sttSupported` are reported separately. Firefox has
 *     speech synthesis but no recognition, and a single flag made listening
 *     fail silently there.
 *   - Voices are loaded asynchronously. `getVoices()` is empty on its first
 *     call in Chrome/Edge, which previously meant a selected voice was
 *     silently ignored on every session.
 *   - Recognition errors surface as a typed `error` object instead of being
 *     swallowed, so the UI can tell a denied microphone apart from silence.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMicLevel } from './useMicLevel';
import {
  createRecognition,
  describeSpeechError,
  getSpeechCapabilities,
  loadVoices,
  UNSUPPORTED_STT_ERROR,
  type SpeechError,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '../services/voice/speechEngine';
import { speak as speakAloud, stopSpeaking } from '../services/voice/speechOutput';

export interface VoiceStudyState {
  speaking: boolean;
  listening: boolean;
  /** True when either capability exists. Prefer the specific flags below. */
  supported: boolean;
  ttsSupported: boolean;
  sttSupported: boolean;
  /** True once the async voice list has resolved. */
  voicesReady: boolean;
  transcript: string;
  interimTranscript: string;
  /** Live normalised mic amplitude, 0..1. Zero unless listening. */
  level: number;
  /** Last recognition failure, or null. Cleared when listening restarts. */
  error: SpeechError | null;
  clearError: () => void;
  speak: (text: string, onEnd?: () => void) => void;
  cancelSpeech: () => void;
  startListening: () => void;
  stopListening: () => void;
}

export function useVoiceStudy(options?: {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  lang?: string;
  /** Keep listening across natural pauses. Essential for hands-free use. */
  continuous?: boolean;
  onTranscript?: (transcript: string) => void;
  onError?: (error: SpeechError) => void;
}): VoiceStudyState {
  const {
    voiceURI,
    rate = 1,
    pitch = 1,
    lang = 'en-US',
    continuous = true,
    onTranscript,
    onError,
  } = options ?? {};

  const [caps] = useState(() => getSpeechCapabilities());
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<SpeechError | null>(null);
  const [voicesReady, setVoicesReady] = useState(false);

  // Written only from callbacks — never during render.
  const transcriptRef = useRef('');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Distinguishes a user-initiated stop from the engine ending on its own.
  const manualStopRef = useRef(false);

  // Keep the latest callbacks without re-creating start/stop each render.
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
  }, [onTranscript, onError]);

  useEffect(() => {
    if (!caps.tts) {
      setVoicesReady(true);
      return;
    }
    let alive = true;
    // speechOutput resolves the voice per utterance; this only reports
    // when the web voice list has settled.
    loadVoices().then(() => {
      if (alive) setVoicesReady(true);
    });
    return () => {
      alive = false;
    };
  }, [caps.tts]);

  // Metered only while the recogniser is open, so the browser's mic
  // indicator clears the moment listening stops.
  const level = useMicLevel(listening);

  // ── Speak ──────────────────────────────────────────────────────────────

  // Bumped on every speak/cancel so a superseded utterance never flips
  // `speaking` off or fires the previous onEnd.
  const speakTokenRef = useRef(0);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!caps.tts) return;
      if (!text.trim()) {
        onEnd?.();
        return;
      }
      const token = ++speakTokenRef.current;
      setSpeaking(true);
      void speakAloud(text, { rate, pitch, lang, voice: voiceURI }).then(({ interrupted }) => {
        if (token !== speakTokenRef.current) return;
        setSpeaking(false);
        // Only a natural finish advances the session; a stop does not.
        if (!interrupted) onEnd?.();
      });
    },
    [caps.tts, voiceURI, rate, pitch, lang],
  );

  const cancelSpeech = useCallback(() => {
    if (!caps.tts) return;
    speakTokenRef.current += 1;
    stopSpeaking();
    setSpeaking(false);
  }, [caps.tts]);

  // ── Recognition ────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!caps.stt) {
      setError(UNSUPPORTED_STT_ERROR);
      onErrorRef.current?.(UNSUPPORTED_STT_ERROR);
      return;
    }
    const recognition = createRecognition({ lang, continuous });
    if (!recognition) {
      setError(UNSUPPORTED_STT_ERROR);
      onErrorRef.current?.(UNSUPPORTED_STT_ERROR);
      return;
    }

    manualStopRef.current = false;
    recognitionRef.current = recognition;
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    transcriptRef.current = '';

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let final = transcriptRef.current;
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      transcriptRef.current = final;
      setTranscript(final);
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: { error: string; message?: string }) => {
      const err = describeSpeechError(event.error);
      setError(err);
      onErrorRef.current?.(err);
    };

    recognition.onend = () => {
      setListening(false);
      setInterimTranscript('');
      const final = transcriptRef.current;
      if (!manualStopRef.current && final && continuous) {
        // Continuous engine timed out on its own (paused at end of sentence);
        // hand the final transcript through and optionally restart.
        onTranscriptRef.current?.(final);
      }
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      setError({
        code: 'unknown',
        message: 'Voice input hit a snag — tap to try again.',
        recoverable: true,
        needsPermission: false,
      });
    }
  }, [caps.stt, lang, continuous]);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    const active = recognitionRef.current;
    recognitionRef.current = null;
    if (active) {
      try {
        active.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // Release engine on unmount.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* no-op */
      }
      // stopSpeaking checks the live API rather than the `caps.tts` snapshot
      // taken at mount; the try guards the case where teardown runs after
      // the API has gone away, since a cleanup that throws leaves React
      // unable to finish unmounting the rest of the tree.
      try {
        stopSpeaking();
      } catch {
        /* no-op */
      }
    };
  }, []);

  return {
    speaking,
    listening,
    supported: caps.tts || caps.stt,
    ttsSupported: caps.tts,
    sttSupported: caps.stt,
    voicesReady,
    transcript,
    interimTranscript,
    level,
    error,
    clearError,
    speak,
    cancelSpeech,
    startListening,
    stopListening,
  };
}