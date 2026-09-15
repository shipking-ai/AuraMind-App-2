/**
 * AuraMind Realtime Notify — Supabase Edge Function (Deno)
 *
 * Broadcasts events to Realtime channels using the service role.
 * Triggered by database triggers via net.http_post() (pg_net).
 *
 * Why not realtime.broadcast_changes():
 *   The `realtime` PostgreSQL extension is not available on all Supabase
 *   projects. pg_net + this Edge Function is the portable alternative.
 *
 * AUTHENTICATION
 *
 * Deployed with --no-verify-jwt, because pg_net has no user session to
 * present. The gate is a shared secret instead: the trigger reads it from
 * Vault (`realtime_notify_secret`) and sends it as `x-webhook-secret`; this
 * function compares it against REALTIME_WEBHOOK_SECRET.
 *
 * It fails closed. An earlier build treated the secret as optional, the
 * secret was never set, and the function would broadcast anything to any
 * user's channel for anyone who found the URL. A missing secret is now a
 * 503, never an open door. See
 * supabase/migrations/20260914000000_realtime_notify_secret.sql.
 *
 * Deploy:
 *   supabase functions deploy realtime-notify --no-verify-jwt
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

interface BroadcastBody {
  channel: string;
  event?: string;
  payload: Record<string, unknown>;
}

/** The only channels the triggers publish to. */
const CHANNEL_PATTERN =
  /^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:notifications$/;

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Constant-time comparison, so response timing can't leak the secret. */
function secretsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(provided);
  const b = encoder.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i % (a.length || 1)] ?? 0) ^ (b[i % (b.length || 1)] ?? 0);
  }
  return diff === 0 && a.length === b.length;
}

// Server-to-server only: no CORS headers, so browsers can't call it at all.
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const expectedSecret = Deno.env.get('REALTIME_WEBHOOK_SECRET');
  if (!expectedSecret) {
    console.error('[realtime-notify] REALTIME_WEBHOOK_SECRET is not set; refusing all requests');
    return json({ error: 'Not configured' }, 503);
  }
  if (!secretsMatch(req.headers.get('x-webhook-secret') ?? '', expectedSecret)) {
    return json({ error: 'Forbidden' }, 403);
  }

  let body: BroadcastBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (typeof body.channel !== 'string' || !CHANNEL_PATTERN.test(body.channel)) {
    return json({ error: 'channel must be user:<uuid>:notifications' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const realtimeChannel = supabase.channel(body.channel);

  try {
    // Wait for subscription to be established (with 5s timeout)
    const subscribeStatus = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        supabase.removeChannel(realtimeChannel);
        reject(new Error('Subscription timeout'));
      }, 5000);

      realtimeChannel.subscribe((status) => {
        clearTimeout(timeout);
        resolve(status);
      });
    });

    if (subscribeStatus !== 'SUBSCRIBED') {
      supabase.removeChannel(realtimeChannel);
      return json({ error: `Failed to subscribe: ${subscribeStatus}` }, 500);
    }

    // Fire-and-forget broadcast (no ack wait needed)
    realtimeChannel.send({
      type: 'broadcast',
      event: body.event ?? 'broadcast',
      payload: body.payload,
    });

    // Brief flush window before cleanup
    await new Promise((r) => setTimeout(r, 200));

    supabase.removeChannel(realtimeChannel);

    return json({ ok: true, channel: body.channel, event: body.event ?? 'broadcast' });
  } catch (err: unknown) {
    try {
      supabase.removeChannel(realtimeChannel);
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[realtime-notify] Error:', message);
    return json({ error: message }, 500);
  }
});
