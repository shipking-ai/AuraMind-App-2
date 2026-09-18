/**
 * speechOutput — the one way AuraMind speaks.
 *
 * Inside the Android app `window.speechSynthesis` does not exist (Android
 * System WebView never shipped it), so read-aloud, voice study and slide
 * narration were all silent there. Everything now speaks through this
 * module, which uses the native AuraSpeech plugin on Android and the Web
 * Speech API everywhere else, and applies the user's voice choice the same
 * way on both.
 *
 * Voice choice (preference `auramind_ttsVoice`):
 *   - "auto"   → the engine's best voice for the language;
 *   - "random" → a random installed voice, picked once per app session so a
 *                card's question and answer are read by the same voice;
 *   - anything else → that exact voice id (Android voice name or web
 *                voiceURI), falling back to auto if it is no longer installed.
 */
import { getAppPreference } from '../../lib/appPreferences';
import { AuraSpeech, hasNativeSpeech } from '../../lib/auraSpeech';
import { loadVoices } from './speechEngine';

export const VOICE_PREF_KEY = 'auramind_ttsVoice';
export const VOICE_AUTO = 'auto';
export const VOICE_RANDOM = 'random';

export interface VoiceOption {
  id: string;
  label: string;
  lang: string;
  /** Needs a connection to speak (Android cloud voices). */
  network: boolean;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
  /** Overrides the saved preference for this utterance. */
  voice?: string;
}

function hasWebSpeech(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export function isSpeechOutputAvailable(): boolean {
  return hasNativeSpeech() || hasWebSpeech();
}

function languageOf(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Voices for the given language (English by default), or every voice when
 * none match. Android labels number the voices per region because engine
 * names like "en-us-x-iob-local" mean nothing to a student.
 */
export async function listVoices(lang = 'en'): Promise<VoiceOption[]> {
  const want = languageOf(lang);

  if (hasNativeSpeech()) {
    try {
      const { voices } = await AuraSpeech.getVoices();
      const matching = voices.filter((v) => languageOf(v.lang) === want);
      const pool = matching.length > 0 ? matching : voices;
      const counts = new Map<string, number>();
      return pool.map((v) => {
        const n = (counts.get(v.localeName) ?? 0) + 1;
        counts.set(v.localeName, n);
        return {
          id: v.id,
          label: `${v.localeName} · Voice ${n}${v.network ? ' (online)' : ''}`,
          lang: v.lang,
          network: v.network,
        };
      });
    } catch {
      return [];
    }
  }

  if (!hasWebSpeech()) return [];
  const voices = await loadVoices();
  const matching = voices.filter((v) => languageOf(v.lang) === want);
  return (matching.length > 0 ? matching : voices).map((v) => ({
    id: v.voiceURI,
    label: `${v.name} (${v.lang})`,
    lang: v.lang,
    network: !v.localService,
  }));
}

let sessionRandomVoice: string | null = null;

/** Test seam: forget this session's random voice. */
export function resetRandomVoice(): void {
  sessionRandomVoice = null;
}

/** Turns a stored choice into a concrete voice id, or undefined for auto. */
export async function resolveVoice(choice: string, lang = 'en'): Promise<string | undefined> {
  if (!choice || choice === VOICE_AUTO) return undefined;
  if (choice !== VOICE_RANDOM) return choice;
  if (sessionRandomVoice) return sessionRandomVoice;
  const voices = await listVoices(lang);
  // Offline voices first: a random pick should not go silent without signal.
  const offline = voices.filter((v) => !v.network);
  const pool = offline.length > 0 ? offline : voices;
  if (pool.length === 0) return undefined;
  sessionRandomVoice = pool[Math.floor(Math.random() * pool.length)].id;
  return sessionRandomVoice;
}

/**
 * Bumped by every speak and stop. Resolving a voice is async, so without it
 * a stop (or a newer speak) that lands during that wait would be followed a
 * moment later by the old text starting anyway.
 */
let generation = 0;

function speakWeb(
  text: string,
  voiceId: string | undefined,
  { rate = 1, pitch = 1, lang = 'en-US' }: SpeakOptions,
  mine: number,
): Promise<{ interrupted: boolean }> {
  return new Promise((resolve) => {
    // Short wait: Chrome fills the list within ~100ms, and a browser with no
    // voices at all must not stall every utterance for the full default.
    void loadVoices(500).then((voices) => {
      if (mine !== generation) {
        resolve({ interrupted: true });
        return;
      }
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = rate;
      utterance.pitch = pitch;
      utterance.lang = lang;
      const exact = voiceId ? voices.find((v) => v.voiceURI === voiceId) : undefined;
      const fallback =
        voices.find((v) => v.name.includes('Google') && v.lang.startsWith(languageOf(lang))) ??
        voices.find((v) => v.lang.startsWith(languageOf(lang)));
      const voice = exact ?? fallback;
      if (voice) utterance.voice = voice;

      let settled = false;
      const settle = (interrupted: boolean) => {
        if (settled) return;
        settled = true;
        utterance.onend = null;
        utterance.onerror = null;
        resolve({ interrupted });
      };
      utterance.onend = () => settle(false);
      // cancel() reports the utterance it stopped as an "interrupted" or
      // "canceled" error; anything else is a real failure, not a stop.
      utterance.onerror = (event) => settle(event.error === 'interrupted' || event.error === 'canceled');

      synth.cancel();
      synth.speak(utterance);
    });
  });
}

/**
 * Speaks text now, replacing anything already playing. Resolves when speech
 * ends; `interrupted` is true when it was stopped or replaced, so callers
 * only advance on a natural finish.
 */
export async function speak(text: string, options: SpeakOptions = {}): Promise<{ interrupted: boolean }> {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return { interrupted: false };
  const mine = ++generation;
  const lang = options.lang ?? 'en-US';
  const choice = options.voice ?? getAppPreference<string>(VOICE_PREF_KEY, VOICE_AUTO);
  const voiceId = await resolveVoice(choice, lang);
  if (mine !== generation) return { interrupted: true };

  if (hasNativeSpeech()) {
    try {
      return await AuraSpeech.speak({
        text: cleaned,
        voice: voiceId ?? VOICE_AUTO,
        lang,
        rate: options.rate ?? 1,
        pitch: options.pitch ?? 1,
      });
    } catch {
      return { interrupted: true };
    }
  }

  if (!hasWebSpeech()) return { interrupted: true };
  return speakWeb(cleaned, voiceId, { ...options, lang }, mine);
}

export function stopSpeaking(): void {
  generation += 1;
  if (hasNativeSpeech()) {
    void AuraSpeech.stop().catch(() => undefined);
    return;
  }
  if (hasWebSpeech()) window.speechSynthesis.cancel();
}
