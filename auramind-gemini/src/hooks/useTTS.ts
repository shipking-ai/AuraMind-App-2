import { useState, useRef, useCallback, useEffect } from "react";
import { useAppPreference } from "../lib/appPreferences";
import {
  isSpeechOutputAvailable,
  speak as speakAloud,
  stopSpeaking,
} from "../services/voice/speechOutput";

export interface TTSOptions {
  rate?: number;
  pitch?: number;
  voice?: string;
}

export interface UseTTSReturn {
  isSpeaking: boolean;
  isEnabled: boolean;
  /** True when this device can speak at all (native on Android, Web Speech elsewhere). */
  supported: boolean;
  toggle: () => void;
  speak: (text: string) => void;
  stop: () => void;
  setEnabled: (enabled: boolean) => void;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*]\s/gm, "")
    .replace(/^\d+\.\s/gm, "")
    .replace(/^>\s/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

export function useTTS(options: TTSOptions = {}): UseTTSReturn {
  const { rate = 0.95, pitch = 1.0 } = options;
  // Native TTS in the Android app (its WebView has no speechSynthesis),
  // Web Speech elsewhere. See services/voice/speechOutput.ts.
  const supported = isSpeechOutputAvailable();

  const [isSpeaking, setIsSpeaking] = useState(false);
  // Keep chat voice output and the Settings > Audio preference on the same
  // switch. The old hook used a private storage key, so enabling "Read cards
  // aloud" had no effect in chat and the header toggle reset on every surface.
  const [isEnabled, setIsEnabled] = useAppPreference<boolean>("auramind_textToSpeech", false);
  // Bumped on every speak/stop so a superseded utterance never flips
  // isSpeaking off underneath the one that replaced it.
  const tokenRef = useRef(0);
  // Set false by the unmount effect so late completions never call setState
  // after the component is gone.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (supported) stopSpeaking();
    };
  }, [supported]);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    if (supported) stopSpeaking();
    if (mountedRef.current) setIsSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      if (!isEnabled || !text.trim()) return;

      const cleaned = stripMarkdown(text);
      if (!cleaned) return;

      const token = ++tokenRef.current;
      setIsSpeaking(true);
      void speakAloud(cleaned, { rate, pitch }).then(() => {
        if (mountedRef.current && token === tokenRef.current) setIsSpeaking(false);
      });
    },
    [isEnabled, rate, pitch, supported],
  );

  const toggle = useCallback(() => {
    if (!supported) return;
    if (isSpeaking) {
      stop();
    } else {
      setIsEnabled((prev) => !prev);
    }
  }, [isSpeaking, setIsEnabled, stop, supported]);

  const setEnabled = useCallback(
    (v: boolean) => {
      setIsEnabled(v);
      if (!v) stop();
    },
    [setIsEnabled, stop],
  );

  return { isSpeaking, isEnabled, supported, toggle, speak, stop, setEnabled };
}
