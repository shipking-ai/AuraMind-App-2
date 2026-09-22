/**
 * nativeRecognition — a SpeechRecognition look-alike backed by Android's
 * SpeechRecognizer (android/.../AuraListenPlugin.java).
 *
 * Android System WebView has no SpeechRecognition, so voice study could
 * speak questions in the Android app but never hear the answer. Returning an
 * object with the browser's shape lets useVoiceStudy keep one code path for
 * results, errors and end-of-speech on every platform.
 *
 * Differences from the browser worth knowing:
 *   - One utterance per start(): Android ends after a pause, which is when
 *     useVoiceStudy hands the transcript on, same as a browser session
 *     ending on its own.
 *   - `onlevel` reports the recogniser's own loudness, so the orb can move
 *     without opening a second microphone stream (which Android may starve).
 */
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { SpeechRecognitionEventLike, SpeechRecognitionLike } from './speechEngine';

interface SessionEvent {
  session: string;
}

interface AuraListenPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  start(options: { session: string; lang: string; interimResults: boolean }): Promise<void>;
  stop(): Promise<void>;
  abort(): Promise<void>;
  addListener(event: 'start' | 'end', listener: (e: SessionEvent) => void): Promise<PluginListenerHandle>;
  addListener(
    event: 'partial' | 'final',
    listener: (e: SessionEvent & { text: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(event: 'level', listener: (e: SessionEvent & { level: number }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'error', listener: (e: SessionEvent & { error: string }) => void): Promise<PluginListenerHandle>;
}

export const AuraListen = registerPlugin<AuraListenPlugin>('AuraListen');

export interface NativeRecognition extends SpeechRecognitionLike {
  /** Normalised 0..1 input loudness while listening. */
  onlevel: ((level: number) => void) | null;
}

function resultEvent(text: string, isFinal: boolean): SpeechRecognitionEventLike {
  const alternative = { transcript: text, confidence: isFinal ? 1 : 0 };
  const result = Object.assign([alternative], { isFinal });
  return { resultIndex: 0, results: [result] };
}

let sessionCounter = 0;

export function createNativeRecognition(opts: {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
}): NativeRecognition {
  const session = `listen-${++sessionCounter}`;
  let handles: PluginListenerHandle[] = [];
  let ended = false;

  const rec: NativeRecognition = {
    lang: opts.lang ?? 'en-US',
    continuous: opts.continuous ?? false,
    interimResults: opts.interimResults ?? true,
    onresult: null,
    onerror: null,
    onend: null,
    onstart: null,
    onlevel: null,
    start: () => {
      void begin();
    },
    stop: () => {
      void AuraListen.stop().catch(() => undefined);
    },
    abort: () => {
      void AuraListen.abort().catch(() => undefined);
    },
  };

  const release = () => {
    const current = handles;
    handles = [];
    current.forEach((handle) => void handle.remove());
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    release();
    rec.onlevel?.(0);
    rec.onend?.();
  };

  const mine = (e: SessionEvent) => e.session === session && !ended;

  async function begin() {
    handles = await Promise.all([
      AuraListen.addListener('start', (e) => {
        if (mine(e)) rec.onstart?.();
      }),
      AuraListen.addListener('partial', (e) => {
        if (mine(e) && rec.interimResults) rec.onresult?.(resultEvent(e.text, false));
      }),
      AuraListen.addListener('final', (e) => {
        if (mine(e) && e.text) rec.onresult?.(resultEvent(e.text, true));
      }),
      AuraListen.addListener('level', (e) => {
        if (mine(e)) rec.onlevel?.(e.level);
      }),
      AuraListen.addListener('error', (e) => {
        // "aborted" is how a stop/replace is reported; the browser reports
        // the same, and useVoiceStudy treats it as a quiet end.
        if (mine(e)) rec.onerror?.({ error: e.error });
      }),
      AuraListen.addListener('end', (e) => {
        if (e.session === session) finish();
      }),
    ]);
    if (ended) {
      release();
      return;
    }
    try {
      await AuraListen.start({ session, lang: rec.lang, interimResults: rec.interimResults });
    } catch (err) {
      // Plugin rejections carry the Web Speech error name as their code.
      const code = (err as { code?: string })?.code;
      rec.onerror?.({ error: code || 'unknown' });
      finish();
    }
  }

  return rec;
}
