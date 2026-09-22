import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// AI voices: server-generated speech in ≤200-character clips, played in
// order, with the device voice as the fallback whenever the server says no.

const session = vi.hoisted(() => ({ token: 'tok' as string | null }));
vi.mock('../services/database/supabase', () => ({
  requireSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: session.token ? { access_token: session.token } : null } }),
    },
  }),
}));

const native = vi.hoisted(() => ({ speak: vi.fn(), stop: vi.fn() }));
vi.mock('../lib/auraSpeech', () => ({
  hasNativeSpeech: () => true,
  AuraSpeech: { getVoices: vi.fn(async () => ({ voices: [] })), speak: native.speak, stop: native.stop },
}));

import {
  MAX_CLIP_CHARS,
  aiVoiceTemporarilyUnavailable,
  resetAiVoiceState,
  splitForSpeech,
} from '../services/voice/aiVoice';
import { speak, stopSpeaking, webVoiceQuality } from '../services/voice/speechOutput';

/** Minimal <audio>: plays instantly and reports the end on the next tick. */
class FakeAudio {
  static played: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onpause: (() => void) | null = null;
  ended = false;
  playbackRate = 1;
  constructor(public src: string) {}
  play() {
    FakeAudio.played.push(this.src);
    setTimeout(() => {
      this.ended = true;
      this.onended?.();
    }, 0);
    return Promise.resolve();
  }
  pause() {
    this.onpause?.();
  }
}

describe('splitForSpeech', () => {
  it('keeps short text whole', () => {
    expect(splitForSpeech('  What is   osmosis? ')).toEqual(['What is osmosis?']);
  });

  it('packs sentences into clips under the limit and never exceeds it', () => {
    const sentence = 'Water moves across a membrane from low to high solute concentration. ';
    const clips = splitForSpeech(sentence.repeat(8));
    expect(clips.length).toBeGreaterThan(1);
    for (const clip of clips) expect(clip.length).toBeLessThanOrEqual(MAX_CLIP_CHARS);
    expect(clips.join(' ')).toBe(sentence.repeat(8).trim());
  });

  it('breaks an overlong sentence at clauses, then words', () => {
    const long = `${'mitochondria produce energy, '.repeat(6)}${'and ribosomes build proteins '.repeat(6)}`;
    const clips = splitForSpeech(long);
    for (const clip of clips) expect(clip.length).toBeLessThanOrEqual(MAX_CLIP_CHARS);
    expect(clips.join(' ').replace(/\s+/g, ' ')).toBe(long.trim().replace(/\s+/g, ' '));
  });
});

describe('speaking with an AI voice', () => {
  beforeEach(() => {
    resetAiVoiceState();
    session.token = 'tok';
    FakeAudio.played = [];
    vi.stubGlobal('Audio', FakeAudio);
    let n = 0;
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => `blob:${++n}`, revokeObjectURL: () => {} });
    native.speak.mockResolvedValue({ interrupted: false });
    native.stop.mockResolvedValue(undefined);
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('plays every clip in order and does not touch the device voice', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(['wav']) }));
    vi.stubGlobal('fetch', fetchMock);
    const text = 'First sentence here. '.repeat(15);

    const result = await speak(text, { voice: 'ai:troy' });

    expect(result).toEqual({ interrupted: false });
    const bodies = fetchMock.mock.calls.map((call) => {
      const init = (call as unknown[])[1] as RequestInit;
      return JSON.parse(String(init.body));
    });
    expect(bodies.every((b) => b.voice === 'troy' && b.text.length <= MAX_CLIP_CHARS)).toBe(true);
    expect(FakeAudio.played).toHaveLength(bodies.length);
    expect(native.speak).not.toHaveBeenCalled();
  });

  it('falls back to the device voice when the server refuses, then stops asking for a while', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503, blob: async () => new Blob() }));
    vi.stubGlobal('fetch', fetchMock);

    await speak('Hello there.', { voice: 'ai:hannah' });
    expect(native.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'Hello there.', voice: 'auto' }));
    expect(aiVoiceTemporarilyUnavailable()).toBe(true);

    await speak('Second card.', { voice: 'ai:hannah' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(native.speak).toHaveBeenCalledTimes(2);
  });

  it('falls back when signed out, without calling the server', async () => {
    session.token = null;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await speak('Hello.', { voice: 'ai:hannah' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(native.speak).toHaveBeenCalledTimes(1);
  });

  it('a stop ends AI playback as interrupted', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.stubGlobal('fetch', vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, blob: async () => new Blob(['wav']) };
    }));

    const pending = speak('Hello there.', { voice: 'ai:hannah' });
    await Promise.resolve();
    stopSpeaking();
    release();

    expect(await pending).toEqual({ interrupted: true });
    expect(FakeAudio.played).toHaveLength(0);
    expect(native.speak).not.toHaveBeenCalled();
  });
});

describe('webVoiceQuality', () => {
  it('ranks neural and enhanced voices above legacy desktop ones', () => {
    const natural = webVoiceQuality({ name: 'Microsoft Aria Online (Natural) - English (United States)', localService: false });
    const google = webVoiceQuality({ name: 'Google US English', localService: false });
    const enhanced = webVoiceQuality({ name: 'Samantha (Enhanced)', localService: true });
    const legacy = webVoiceQuality({ name: 'Microsoft David Desktop - English (United States)', localService: true });
    expect(natural).toBeGreaterThan(google);
    expect(enhanced).toBeGreaterThan(legacy);
    expect(google).toBeGreaterThan(legacy);
  });
});
