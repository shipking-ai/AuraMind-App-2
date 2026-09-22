import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const postMessage = vi.fn();

const load = async () => {
  vi.resetModules();
  return import('../lib/windowsWidget');
};

beforeEach(() => {
  postMessage.mockClear();
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ active: { postMessage } }), controller: null },
  });
});

describe('publishWindowsWidgetState', () => {
  it('posts a normalized payload to the service worker', async () => {
    const { publishWindowsWidgetState } = await load();
    await publishWindowsWidgetState({ due: 12.7, deck: '  Neuroscience  ', streak: 5 });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'auramind-widget-state',
      state: { due: 12, deck: 'Neuroscience', streak: 5 },
    });
  });

  it('floors negatives and nulls to zero and an empty deck', async () => {
    const { publishWindowsWidgetState } = await load();
    await publishWindowsWidgetState({ due: -3, deck: null, streak: null });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'auramind-widget-state',
      state: { due: 0, deck: '', streak: 0 },
    });
  });

  it('does not re-post an unchanged state, but does post a changed one', async () => {
    const { publishWindowsWidgetState } = await load();
    await publishWindowsWidgetState({ due: 4, deck: 'A', streak: 1 });
    await publishWindowsWidgetState({ due: 4, deck: 'A', streak: 1 });
    expect(postMessage).toHaveBeenCalledTimes(1);
    await publishWindowsWidgetState({ due: 3, deck: 'A', streak: 1 });
    expect(postMessage).toHaveBeenCalledTimes(2);
  });

  it('retries after a worker that is not ready yet', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('no worker')), controller: null },
    });
    const { publishWindowsWidgetState } = await load();
    await publishWindowsWidgetState({ due: 4 });

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active: { postMessage } }), controller: null },
    });
    await publishWindowsWidgetState({ due: 4 });
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});

describe('widget card contract', () => {
  const read = (file: string) =>
    readFileSync(resolve(__dirname, '../../public/widgets', file), 'utf8');

  it('the Adaptive Card template binds exactly the fields the worker sends', () => {
    const template = read('due-template.json');
    const worker = readFileSync(resolve(__dirname, '../../public/widget-sw.js'), 'utf8');
    const bound = [...template.matchAll(/\$\{(\w+)/g)].map((m) => m[1]);
    for (const field of new Set(bound)) {
      expect(worker, `toCardData must produce ${field}`).toContain(`${field}:`);
    }
    expect(JSON.parse(template).type).toBe('AdaptiveCard');
  });

  it('ships default data for the board to render before the app has run', () => {
    const data = JSON.parse(read('due-data.json'));
    expect(data.due).toBe('0');
    expect(data.actionUrl).toBe('/dashboard');
  });
});

describe('widget service worker', () => {
  /** Runs public/widget-sw.js against a stubbed worker global. */
  async function bootWorker() {
    const source = readFileSync(resolve(__dirname, '../../public/widget-sw.js'), 'utf8');
    const listeners = new Map<string, (event: any) => void>();
    // The real Cache API hands out a fresh Response per match; storing the
    // body text keeps this stub from replaying a consumed one.
    const stored = new Map<string, string>();
    const updateByTag = vi.fn(async () => {});
    const openWindow = vi.fn(async () => {});
    const self = {
      addEventListener: (type: string, fn: (event: any) => void) => listeners.set(type, fn),
      widgets: {
        getByTag: vi.fn(async (tag: string) => ({ tag })),
        updateByTag,
      },
      clients: { openWindow },
    };
    const caches = {
      open: async () => ({
        match: async (url: string) =>
          stored.has(url) ? new Response(stored.get(url)) : undefined,
        put: async (url: string, res: Response) => { stored.set(url, await res.text()); },
      }),
    };
    const fetch = vi.fn(async () => new Response('{"type":"AdaptiveCard"}'));
    new Function('self', 'caches', 'fetch', 'Response', source)(self, caches, fetch, Response);

    const fire = async (type: string, event: Record<string, unknown>) => {
      const waits: Promise<unknown>[] = [];
      listeners.get(type)?.({ ...event, waitUntil: (p: Promise<unknown>) => waits.push(p) });
      await Promise.all(waits);
    };
    return { fire, updateByTag, openWindow };
  }

  it('renders the card from the state the app posted, and re-renders on resume', async () => {
    const { fire, updateByTag } = await bootWorker();
    await fire('message', {
      data: { type: 'auramind-widget-state', state: { due: 7, deck: 'Neuroscience', streak: 4 } },
    });
    const data = JSON.parse(updateByTag.mock.calls[0][1].data);
    expect(data).toMatchObject({
      due: '7',
      headline: '7 cards due',
      detail: 'Starting with Neuroscience',
      streakLine: '4-day streak',
      actionUrl: '/dashboard/study',
    });

    await fire('widgetresume', {});
    expect(JSON.parse(updateByTag.mock.calls[1][1].data).due).toBe('7');
  });

  it('says all caught up with nothing due, and hides a one-day streak', async () => {
    const { fire, updateByTag } = await bootWorker();
    await fire('message', {
      data: { type: 'auramind-widget-state', state: { due: 0, deck: '', streak: 1 } },
    });
    expect(JSON.parse(updateByTag.mock.calls[0][1].data)).toMatchObject({
      headline: 'All caught up',
      streakLine: '',
      actionUrl: '/dashboard',
    });
  });

  it('ignores foreign messages and opens the queue on the study action', async () => {
    const { fire, updateByTag, openWindow } = await bootWorker();
    await fire('message', { data: { type: 'something-else' } });
    expect(updateByTag).not.toHaveBeenCalled();
    await fire('widgetclick', { action: 'study' });
    expect(openWindow).toHaveBeenCalledWith('/dashboard/study');
  });
});
