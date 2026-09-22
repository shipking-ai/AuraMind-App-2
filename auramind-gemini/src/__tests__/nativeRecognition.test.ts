import { describe, it, expect, vi, beforeEach } from 'vitest';

// nativeRecognition turns AuraListen plugin events into the Web Speech API
// shape useVoiceStudy already consumes. These tests drive a fake plugin.

type Listener = (e: Record<string, unknown>) => void;

const fake = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: Record<string, unknown>) => void>>();
  return {
    listeners,
    start: vi.fn(),
    stop: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => Promise.resolve()),
    emit(event: string, data: Record<string, unknown>) {
      listeners.get(event)?.forEach((fn) => fn(data));
    },
  };
});

vi.mock('@capacitor/core', () => ({
  registerPlugin: () => ({
    start: fake.start,
    stop: fake.stop,
    abort: fake.abort,
    isAvailable: () => Promise.resolve({ available: true }),
    addListener: (event: string, fn: Listener) => {
      if (!fake.listeners.has(event)) fake.listeners.set(event, new Set());
      fake.listeners.get(event)!.add(fn);
      return Promise.resolve({ remove: () => Promise.resolve(fake.listeners.get(event)!.delete(fn)) });
    },
  }),
}));

import { createNativeRecognition } from '../services/voice/nativeRecognition';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createNativeRecognition', () => {
  beforeEach(() => {
    fake.listeners.clear();
    fake.start.mockReset().mockResolvedValue(undefined);
  });

  it('maps partial and final results, level and end into the browser shape', async () => {
    const rec = createNativeRecognition({ lang: 'en-GB', interimResults: true });
    const results: Array<{ text: string; isFinal: boolean }> = [];
    const levels: number[] = [];
    const onend = vi.fn();
    rec.onresult = (e) => results.push({ text: e.results[0][0].transcript, isFinal: e.results[0].isFinal });
    rec.onlevel = (l) => levels.push(l);
    rec.onend = onend;

    rec.start();
    await flush();
    const { session, lang } = fake.start.mock.calls[0][0];
    expect(lang).toBe('en-GB');

    fake.emit('partial', { session, text: 'mito' });
    fake.emit('level', { session, level: 0.6 });
    fake.emit('final', { session, text: 'mitochondria' });
    fake.emit('end', { session });

    expect(results).toEqual([
      { text: 'mito', isFinal: false },
      { text: 'mitochondria', isFinal: true },
    ]);
    expect(levels).toEqual([0.6, 0]);
    expect(onend).toHaveBeenCalledTimes(1);
    // Listeners are released, so a later session can't reach this one.
    expect([...fake.listeners.values()].every((set) => set.size === 0)).toBe(true);
  });

  it('ignores events from another session', async () => {
    const rec = createNativeRecognition({});
    const onresult = vi.fn();
    const onend = vi.fn();
    rec.onresult = onresult;
    rec.onend = onend;
    rec.start();
    await flush();

    fake.emit('final', { session: 'someone-else', text: 'stale' });
    fake.emit('end', { session: 'someone-else' });

    expect(onresult).not.toHaveBeenCalled();
    expect(onend).not.toHaveBeenCalled();
  });

  it('reports a refused start as an error and ends', async () => {
    fake.start.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'not-allowed' }));
    const rec = createNativeRecognition({});
    const onerror = vi.fn();
    const onend = vi.fn();
    rec.onerror = onerror;
    rec.onend = onend;

    rec.start();
    await flush();
    await flush();

    expect(onerror).toHaveBeenCalledWith({ error: 'not-allowed' });
    expect(onend).toHaveBeenCalledTimes(1);
  });

  it('stop and abort go to the plugin', () => {
    const rec = createNativeRecognition({});
    rec.stop();
    rec.abort();
    expect(fake.stop).toHaveBeenCalled();
    expect(fake.abort).toHaveBeenCalled();
  });
});
