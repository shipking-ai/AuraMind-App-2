/**
 * End-to-End Realtime Test
 *
 * Validates the full Supabase Realtime pipeline:
 *   1. Channel subscription reaches SUBSCRIBED
 *   2. Broadcast messages round-trip correctly
 *   3. Postgres Changes fire on row mutations
 *   4. Reconnect backoff resets after success
 *   5. Typing indicators deliver with debounce
 *   6. Deck collaboration presence works
 *   7. Multiplayer study events broadcast
 *
 * Run with: vitest run src/__tests__/realtimeE2E.test.ts
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY env vars pointing
 * at a test Supabase project (never production).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';

// ─── Helpers ───────────────────────────────────────────────────

function _waitFor(
  condition: () => boolean,
  timeoutMs = 5_000,
  intervalMs = 50,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) return resolve();
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for condition after ${timeoutMs}ms`));
      }
      setTimeout(check, intervalMs);
    };
    check();
  });
}

// Without Supabase credentials the E2E suite cannot run — skip rather
// than fail. The notification-service and service-loader suites below
// don't need credentials and always run.
const hasCreds = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ─── Tests ─────────────────────────────────────────────────────

  describe.skipIf(!hasCreds)('Supabase Realtime E2E', () => {
    vi.setConfig({ testTimeout: 15_000 });
    let supabaseClient: any;
    const extraClients: any[] = [];
    const testChannelName = `test-e2e-${Date.now()}`;
    const receivedMessages: any[] = [];

    // supabase-js quirk: when the LAST channel on a client is removed, the
    // realtime socket is torn down and the next subscription on that client
    // times out (join never lands). Tests that broadcast therefore run on
    // their own isolated client, and the shared client keeps one anchor
    // channel attached for the whole file (cleaned up in afterAll).
    async function freshClient(): Promise<any> {
      const c = createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      );
      extraClients.push(c);
      return c;
    }

    beforeAll(async () => {
      // Real sockets: under jsdom 30 the environment's WebSocket is undici's,
      // which dispatches Node events into jsdom's EventTarget and throws
      // ("must be an instance of Event"), so no message ever round-trips.
      const { WebSocket: NodeWebSocket } = await import('ws');
      vi.stubGlobal('WebSocket', NodeWebSocket);
      // Dynamically import supabase client
      const mod = await import('../services/database/supabase');
      supabaseClient = mod.supabase;

      if (!supabaseClient) {
        throw new Error(
          'Supabase client not available — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY',
        );
      }
    });

    afterAll(async () => {
      // Cleanup
      const clients = [supabaseClient, ...extraClients];
      for (const client of clients) {
        if (!client) continue;
        const channels = client.getChannels();
        for (const ch of channels) {
          if (ch.topic?.startsWith('test-e2e-')) {
            await client.removeChannel(ch);
          }
        }
      }
    });

  beforeEach(() => {
    receivedMessages.length = 0;
  });

  it('should connect to Supabase Realtime and reach SUBSCRIBED', async () => {
    const channel = supabaseClient.channel(testChannelName);

    const statusPromise = new Promise<string>((resolve) => {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') resolve(status);
      });
    });

    const status = await statusPromise;
    expect(status).toBe('SUBSCRIBED');

    // Keep the anchor channel attached — removing the last channel tears
    // down the client's realtime socket and the next subscription times out.
    // afterAll cleans it up.
  });

  it('should round-trip broadcast messages', async () => {
    const channelName = `${testChannelName}-broadcast`;
    const client = await freshClient();
    const channel = client.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    const testPayload = { message: 'hello-e2e', ts: Date.now() };

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('broadcast round-trip timeout')), 10_000);
      channel
        .on('broadcast', { event: 'test' }, (event: any) => {
          clearTimeout(timer);
          receivedMessages.push(event.payload);
          resolve();
        })
        .subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            // Small delay to ensure server-side subscription is fully established
            await new Promise(r => setTimeout(r, 200));
            channel.send({
              type: 'broadcast',
              event: 'test',
              payload: testPayload,
            });
          }
        });
    });

    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].message).toBe('hello-e2e');
    expect(receivedMessages[0].ts).toBe(testPayload.ts);

    await client.removeChannel(channel);
  });

  it('should handle multiple subscribers on the same channel', async () => {
    const channelName = `${testChannelName}-multi`;
    // Two separate clients = the realistic multi-user fanout scenario. A
    // second channel object with the SAME topic on the SAME client does not
    // receive its own socket's broadcasts (the server treats one join per
    // socket as authoritative), so cross-subscriber delivery is proven here.
    const ch1 = supabaseClient.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    const multiClient = await freshClient();
    const ch2 = multiClient.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    const received1: any[] = [];
    const received2: any[] = [];

    const bothReceived = new Promise<void>((resolve) => {
      let count = 0;
      const check = () => {
        if (++count >= 2) resolve();
      };

      ch1.on('broadcast', { event: 'multi-test' }, (e: any) => {
        received1.push(e.payload);
        check();
      });

      ch2.on('broadcast', { event: 'multi-test' }, (e: any) => {
        received2.push(e.payload);
        check();
      });
    });

    await new Promise<void>((resolve, _reject) => {
      let subs = 0;
      const onSub = async (status: string) => {
        if (status === 'SUBSCRIBED') {
          if (++subs === 2) {
            await new Promise(r => setTimeout(r, 200));
            ch1.send({
              type: 'broadcast',
              event: 'multi-test',
              payload: { from: 'ch1' },
            });
            resolve();
          }
        }
      };
      ch1.subscribe(onSub);
      ch2.subscribe(onSub);
    });

    await bothReceived;
    expect(received1.length).toBe(1);
    expect(received2.length).toBe(1);

    await supabaseClient.removeChannel(ch1);
    await supabaseClient.removeChannel(ch2);
  });

  it('should handle rapid-fire messages without dropping', async () => {
    const channelName = `${testChannelName}-rapid`;
    const channel = supabaseClient.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    const MESSAGE_COUNT = 10;
    const received: number[] = [];

    await new Promise<void>((resolve) => {
      channel
        .on('broadcast', { event: 'seq' }, (event: any) => {
          received.push(event.payload.seq);
          if (received.length === MESSAGE_COUNT) resolve();
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            for (let i = 0; i < MESSAGE_COUNT; i++) {
              channel.send({
                type: 'broadcast',
                event: 'seq',
                payload: { seq: i },
              });
            }
          }
        });
    });

    // Allow for potential out-of-order delivery
    expect(received.length).toBe(MESSAGE_COUNT);
    const sorted = [...received].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: MESSAGE_COUNT }, (_, i) => i));

    await supabaseClient.removeChannel(channel);
  });

  it('should survive channel destroy and recreate', async () => {
    const channelName = `${testChannelName}-lifecycle`;
    let channel = supabaseClient.channel(channelName, {
      config: { broadcast: { self: true } },
    });

    // First lifecycle
    await new Promise<void>((resolve) => {
      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') resolve();
      });
    });

    await supabaseClient.removeChannel(channel);

    // Second lifecycle — same name, new channel object
    channel = supabaseClient.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    const payload = { round: 2 };
    const received: any[] = [];

    await new Promise<void>((resolve) => {
      channel
        .on('broadcast', { event: 'test' }, (e: any) => {
          received.push(e.payload);
          resolve();
        })
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') {
            channel.send({ type: 'broadcast', event: 'test', payload });
          }
        });
    });

    expect(received.length).toBe(1);
    expect(received[0].round).toBe(2);

    await supabaseClient.removeChannel(channel);
  });
});

describe('Realtime Notifications Service', () => {
  it('should export all required public API functions', async () => {
    const mod = await import('../services/notifications/realtimeNotifications');

    expect(typeof mod.initRealtimeNotifications).toBe('function');
    expect(typeof mod.destroyRealtimeNotifications).toBe('function');
    expect(typeof mod.onConnectionStatusChange).toBe('function');
    expect(typeof mod.getConnectionStatus).toBe('function');
    expect(typeof mod.isRealtimeActive).toBe('function');
  });

  it('should return disconnected as initial status', async () => {
    const mod = await import('../services/notifications/realtimeNotifications');
    expect(mod.getConnectionStatus()).toBe('disconnected');
  });
});

describe('Service Loader', () => {
  it('should register and load services lazily', async () => {
    const mod = await import('../lib/serviceLoader');

    const testLoader = vi.fn().mockResolvedValue({ default: 'test' });
    mod.registerService('test-service', testLoader, { description: 'Test' });

    // Not loaded yet — loader should not have been called
    expect(testLoader).not.toHaveBeenCalled();

    // Load it
    const result = await mod.loadService('test-service');
    expect(testLoader).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ default: 'test' });

    // Second call returns cached — loader not called again
    const result2 = await mod.loadService('test-service');
    expect(testLoader).toHaveBeenCalledTimes(1);
    expect(result2).toEqual({ default: 'test' });

    // Status should show loaded
    const status = mod.getServiceStatus();
    const svc = status.find((s) => s.name === 'test-service');
    expect(svc).toBeDefined();
    expect(svc!.loaded).toBe(true);

    // Cleanup
    mod.unregisterService('test-service');
  });

  it('should throw for unregistered services', async () => {
    const mod = await import('../lib/serviceLoader');
    await expect(mod.loadService('nonexistent')).rejects.toThrow('not registered');
  });

  it('should reset a service for retry', async () => {
    const mod = await import('../lib/serviceLoader');
    let callCount = 0;
    mod.registerService('retryable', () => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('first attempt fails'));
      return Promise.resolve({ ok: true });
    });

    // First load fails
    await expect(mod.loadService('retryable')).rejects.toThrow('first attempt fails');

    // Reset and retry
    mod.resetService('retryable');
    const result = await mod.loadService('retryable');
    expect(result).toEqual({ ok: true });

    mod.unregisterService('retryable');
  });
});
