/**
 * speechEngine — shared, framework-free wrapper around the Web Speech API.
 *
 * Exists because voice is AuraMind's differentiator and the two hooks that
 * implemented it (useTTS, useVoiceStudy) had diverged, each with different
 * bugs. Everything browser-quirk-shaped lives here so the hooks stay thin.
 *
 * The three quirks this file exists to absorb:
 *
 *  1. `speechSynthesis.getVoices()` returns an EMPTY array on first call in
 *     Chrome/Edge. Voices arrive asynchronously and fire `voiceschanged`.
 *     Code that reads voices once at mount silently never gets a voice.
 *  2. TTS and STT are separate capabilities. Firefox ships
 *     `speechSynthesis` but NOT `SpeechRecognition`, so a single `supported`
 *     flag reports true and then listening fails with no explanation.
 *  3. `SpeechRecognition.onerror` reports very different failures through
 *     one channel. A denied mic and a moment of silence are not the same
 *     event and must not produce the same UI.
 */

import { hasNativeSpeech } from '../../lib/auraSpeech';

// ── Capabilities ────────────────────────────────────────────────────────

export interface SpeechCapabilities {
  /** Text-to-speech is available (speechSynthesis). */
  tts: boolean;
  /** Speech-to-text is available (SpeechRecognition / webkitSpeechRecognition). */
  stt: boolean;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function getSpeechCapabilities(): SpeechCapabilities {
  if (typeof window === 'undefined') return { tts: false, stt: false };
  return {
    // The Android app's WebView has no speechSynthesis; it speaks through
    // the native AuraSpeech plugin instead (see speechOutput.ts).
    tts: 'speechSynthesis' in window || hasNativeSpeech(),
    stt: getRecognitionCtor() !== null,
  };
}

// ── Voice loading ───────────────────────────────────────────────────────

let voiceCache: SpeechSynthesisVoice[] | null = null;

/**
 * Resolves the installed TTS voices, waiting for the async load when the
 * first `getVoices()` call comes back empty.
 *
 * Falls back to a short poll because Safari does not reliably fire
 * `voiceschanged`, and resolves with `[]` rather than hanging if voices
 * never arrive — callers treat an empty list as "use the browser default".
 */
/**
 * Reads the installed voices without ever throwing, even when the
 * speechSynthesis API is absent or torn down mid-flight (e.g. in tests).
 */
function safeGetVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  try {
    return window.speechSynthesis.getVoices() ?? [];
  } catch {
    return [];
  }
}

export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve([]);
  }
  if (voiceCache && voiceCache.length > 0) return Promise.resolve(voiceCache);

  const immediate = safeGetVoices();
  if (immediate.length > 0) {
    voiceCache = immediate;
    return Promise.resolve(immediate);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (voices: SpeechSynthesisVoice[]) => {
      if (settled) return;
      settled = true;
      window.speechSynthesis?.removeEventListener?.('voiceschanged', onChange);
      clearInterval(poll);
      clearTimeout(bail);
      if (voices.length > 0) voiceCache = voices;
      resolve(voices);
    };

    const onChange = () => finish(safeGetVoices());
    window.speechSynthesis?.addEventListener?.('voiceschanged', onChange);

    // Safari does not always fire voiceschanged.
    const poll = setInterval(() => {
      const v = safeGetVoices();
      if (v.length > 0) finish(v);
    }, 100);

    const bail = setTimeout(() => finish(safeGetVoices()), timeoutMs);
  });
}

/** Best English voice available, preferring higher-quality cloud voices. */
export function pickPreferredVoice(
  voices: SpeechSynthesisVoice[],
  voiceURI?: string,
  lang = 'en',
): SpeechSynthesisVoice | undefined {
  if (voiceURI) {
    const exact = voices.find((v) => v.voiceURI === voiceURI);
    if (exact) return exact;
  }
  return (
    voices.find((v) => v.name.includes('Google') && v.lang.startsWith(lang)) ??
    voices.find((v) => v.name.includes('Natural') && v.lang.startsWith(lang)) ??
    voices.find((v) => v.lang.startsWith(lang))
  );
}

/** Clears the module-level voice cache. Test seam. */
export function resetVoiceCache(): void {
  voiceCache = null;
}

// ── Recognition types ───────────────────────────────────────────────────

/**
 * Minimal structural type for SpeechRecognition. The DOM lib does not ship
 * one (it is still vendor-prefixed in most browsers), and this is narrower
 * and safer than the `any` the hooks used previously.
 */
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

// ── Error taxonomy ──────────────────────────────────────────────────────

export type SpeechErrorCode =
  | 'not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'aborted'
  | 'service-not-allowed'
  | 'unsupported'
  | 'unknown';

export interface SpeechError {
  code: SpeechErrorCode;
  /** Message written for a student mid-study, not for a developer. */
  message: string;
  /** Whether retrying the same action could plausibly succeed. */
  recoverable: boolean;
  /** True when the user must change a browser/OS setting to proceed. */
  needsPermission: boolean;
}

/**
 * Maps a raw SpeechRecognition error string to something actionable.
 *
 * Every branch previously collapsed into `setListening(false)`, so a user
 * who denied the mic prompt saw a button that did nothing at all.
 */
export function describeSpeechError(raw: string): SpeechError {
  switch (raw) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        code: raw as SpeechErrorCode,
        message:
          'Microphone access is blocked. Allow the mic for this site in your browser’s address-bar icon, then try again.',
        recoverable: false,
        needsPermission: true,
      };
    case 'no-speech':
      return {
        code: 'no-speech',
        message: 'I didn’t catch that — tap to answer again.',
        recoverable: true,
        needsPermission: false,
      };
    case 'audio-capture':
      return {
        code: 'audio-capture',
        message:
          'No microphone found. Check that one is connected and not in use by another app.',
        recoverable: false,
        needsPermission: false,
      };
    case 'network':
      return {
        code: 'network',
        message:
          'Speech recognition needs a connection. Reconnect and try again — your progress is saved.',
        recoverable: true,
        needsPermission: false,
      };
    case 'aborted':
      return {
        code: 'aborted',
        message: 'Listening stopped.',
        recoverable: true,
        needsPermission: false,
      };
    default:
      return {
        code: 'unknown',
        message: 'Voice input hit a snag — tap to try again.',
        recoverable: true,
        needsPermission: false,
      };
  }
}

/** The error shown when the browser has no SpeechRecognition at all. */
export const UNSUPPORTED_STT_ERROR: SpeechError = {
  code: 'unsupported',
  message:
    'This browser can’t listen for spoken answers. Chrome or Edge support hands-free study; you can still use audio playback and type your answer here.',
  recoverable: false,
  needsPermission: false,
};

/** Creates a configured recognition instance, or null when unsupported. */
export function createRecognition(opts: {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}): SpeechRecognitionLike | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = opts.lang ?? 'en-US';
  rec.continuous = opts.continuous ?? false;
  rec.interimResults = opts.interimResults ?? true;
  return rec;
}
