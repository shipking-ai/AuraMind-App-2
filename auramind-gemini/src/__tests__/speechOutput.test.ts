import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// speechOutput is the single speaking path: native AuraSpeech inside the
// Android app (whose WebView has no speechSynthesis) and Web Speech
// elsewhere, with the Automatic / Random / chosen voice rule applied on both.

const native = vi.hoisted(() => ({
  enabled: false,
  getVoices: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('../lib/auraSpeech', () => ({
  hasNativeSpeech: () => native.enabled,
  AuraSpeech: { getVoices: native.getVoices, speak: native.speak, stop: native.stop },
}));

import {
  listVoices,
  resetRandomVoice,
  resolveVoice,
  speak,
  stopSpeaking,
  VOICE_PREF_KEY,
} from '../services/voice/speechOutput';
import { resetVoiceCache } from '../services/voice/speechEngine';

const NATIVE_VOICES = [
  { id: 'en-us-x-a-local', lang: 'en-US', localeName: 'English (United States)', network: false, quality: 400 },
  { id: 'en-us-x-b-network', lang: 'en-US', localeName: 'English (United States)', network: true, quality: 400 },
  { id: 'en-gb-x-c-local', lang: 'en-GB', localeName: 'English (United Kingdom)', network: false, quality: 400 },
  { id: 'fr-fr-x-d-local', lang: 'fr-FR', localeName: 'French (France)', network: false, quality: 400 },
];

describe('speechOutput on Android (native)', () => {
  beforeEach(() => {
    native.enabled = true;
    native.getVoices.mockResolvedValue({ available: true, defaultLanguage: 'en-US', voices: NATIVE_VOICES });
    native.speak.mockResolvedValue({ interrupted: false });
    native.stop.mockResolvedValue(undefined);
    window.localStorage.clear();
    resetRandomVoice();
  });

  afterEach(() => {
    native.enabled = false;
    vi.clearAllMocks();
  });

  it('lists only voices in the app language, with readable numbered labels', async () => {
    const voices = await listVoices('en');
    expect(voices.map((v) => v.id)).toEqual(['en-us-x-a-local', 'en-us-x-b-network', 'en-gb-x-c-local']);
    expect(voices[0].label).toBe('English (United States) · Voice 1');
    expect(voices[1].label).toBe('English (United States) · Voice 2 (online)');
    expect(voices[2].label).toBe('English (United Kingdom) · Voice 1');
  });

  it('speaks natively with the automatic voice by default', async () => {
    const result = await speak('  What is   osmosis? ');
    expect(result).toEqual({ interrupted: false });
    expect(native.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'What is osmosis?', voice: 'auto', lang: 'en-US' }),
    );
  });

  it('uses the chosen voice from settings', async () => {
    window.localStorage.setItem(VOICE_PREF_KEY, JSON.stringify('en-gb-x-c-local'));
    await speak('Hello');
    expect(native.speak).toHaveBeenCalledWith(expect.objectContaining({ voice: 'en-gb-x-c-local' }));
  });

  it('random picks an offline voice once and keeps it for the session', async () => {
    const first = await resolveVoice('random');
    const again = await resolveVoice('random');
    expect(first).toBeDefined();
    expect(again).toBe(first);
    // Never the network-only voice, and never another language.
    expect(['en-us-x-a-local', 'en-gb-x-c-local']).toContain(first);
  });

  it('reports a failed native speak as interrupted instead of throwing', async () => {
    native.speak.mockRejectedValueOnce(new Error('engine missing'));
    await expect(speak('Hello')).resolves.toEqual({ interrupted: true });
  });

  it('stops natively', () => {
    stopSpeaking();
    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it('skips empty text without touching the engine', async () => {
    await expect(speak('   ')).resolves.toEqual({ interrupted: false });
    expect(native.speak).not.toHaveBeenCalled();
  });
});

describe('speechOutput in the browser (Web Speech)', () => {
  const spoken: Array<{ text: string; voice?: { voiceURI: string } }> = [];
  const webVoices = [
    { voiceURI: 'uri-us', name: 'Google US English', lang: 'en-US', localService: false },
    { voiceURI: 'uri-gb', name: 'Daniel', lang: 'en-GB', localService: true },
  ];

  beforeEach(() => {
    native.enabled = false;
    spoken.length = 0;
    resetVoiceCache();
    resetRandomVoice();
    window.localStorage.clear();
    class Utterance {
      text: string;
      voice?: { voiceURI: string };
      rate = 1;
      pitch = 1;
      lang = '';
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => webVoices,
        cancel: vi.fn(),
        speak: (u: Utterance) => {
          spoken.push({ text: u.text, voice: u.voice });
          queueMicrotask(() => u.onend?.());
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
  });

  it('speaks with the chosen web voice', async () => {
    window.localStorage.setItem(VOICE_PREF_KEY, JSON.stringify('uri-gb'));
    await expect(speak('Hello there')).resolves.toEqual({ interrupted: false });
    expect(spoken).toEqual([{ text: 'Hello there', voice: expect.objectContaining({ voiceURI: 'uri-gb' }) }]);
  });

  it('lists web voices by name', async () => {
    const voices = await listVoices('en');
    expect(voices.map((v) => v.label)).toEqual(['Google US English (en-US)', 'Daniel (en-GB)']);
  });
});

describe('speechOutput stop during voice lookup', () => {
  beforeEach(() => {
    native.enabled = true;
    native.speak.mockResolvedValue({ interrupted: false });
    native.stop.mockResolvedValue(undefined);
    resetRandomVoice();
    window.localStorage.clear();
  });

  afterEach(() => {
    native.enabled = false;
    vi.clearAllMocks();
  });

  it('never starts speech that was stopped while its voice was still resolving', async () => {
    let release: (value: unknown) => void = () => undefined;
    native.getVoices.mockReturnValue(new Promise((resolve) => { release = resolve; }));

    const pending = speak('Old card', { voice: 'random' });
    stopSpeaking();
    release({ available: true, defaultLanguage: 'en-US', voices: NATIVE_VOICES });

    await expect(pending).resolves.toEqual({ interrupted: true });
    expect(native.speak).not.toHaveBeenCalled();
  });
});
