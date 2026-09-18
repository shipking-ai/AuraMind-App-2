import { registerPlugin } from '@capacitor/core';
import { Capacitor } from './nativeShim';

/**
 * Bridge to the native AuraSpeech plugin
 * (android/app/src/main/java/com/auramind/app/AuraSpeechPlugin.java).
 *
 * Android System WebView has no speechSynthesis, so inside the Android app
 * every spoken word goes through here. Callers should use
 * services/voice/speechOutput.ts, which picks this or the Web Speech API.
 */

export interface NativeVoice {
  /** Engine voice name, e.g. "en-us-x-iob-local". Stable across launches. */
  id: string;
  /** BCP-47 tag, e.g. "en-US". */
  lang: string;
  /** Localised language name, e.g. "English (United States)". */
  localeName: string;
  /** Needs a connection to speak. */
  network: boolean;
  quality: number;
}

export interface SpokenReminderSettings {
  enabled: boolean;
  hour?: number;
  minute?: number;
  /** 1 = Sunday … 7 = Saturday. Omit for daily. */
  weekday?: number;
  mode?: 'random' | 'chosen';
  message?: string;
  messages?: string[];
  voice?: string;
  lang?: string;
  title?: string;
}

interface AuraSpeechPlugin {
  getVoices(): Promise<{ available: boolean; defaultLanguage: string; voices: NativeVoice[] }>;
  speak(options: {
    text: string;
    voice?: string;
    lang?: string;
    rate?: number;
    pitch?: number;
  }): Promise<{ interrupted: boolean }>;
  stop(): Promise<void>;
  setSpokenReminder(options: SpokenReminderSettings): Promise<void>;
  previewSpokenReminder(options: { message: string; voice?: string; lang?: string }): Promise<void>;
}

export const AuraSpeech = registerPlugin<AuraSpeechPlugin>('AuraSpeech');

export function hasNativeSpeech(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}
