/**
 * Server-side AI proxy for Groq.
 *
 * Moves the Groq API key out of the client bundle: browsers authenticate to
 * these endpoints with their Supabase session token and the function injects
 * the server-side key (GROQ_API_KEY) before forwarding to api.groq.com.
 *
 * Endpoints (mounted at /api/ai via the catch-all in index.ts):
 *   POST /api/ai/chat        — non-streaming completion, OpenAI-shaped JSON
 *   POST /api/ai/chat/stream — OpenAI-style SSE deltas (choices[0].delta.content)
 *   POST /api/ai/transcribe  — audio → text (multipart forwarded to Groq;
 *                              the client sends base64 in JSON to keep the
 *                              proxy free of raw file uploads)
 *
 * Security properties:
 *   - Requires a valid Supabase session (Bearer token) — mirrors /api/search
 *     and /api/email so anonymous callers can't burn the key.
 *   - Model is allowlisted; unknown models fall back to the server default.
 *     A stale bundle can never steer the server toward a pricier model.
 *   - Messages/content are length-capped and role-whitelisted.
 *   - temperature / max_tokens are clamped to prevent cost abuse.
 *   - Per-user in-memory rate limit on top of the IP bucket in _middleware.ts.
 *   - The Groq key is never echoed in error bodies.
 *
 * Usage is logged to the `chat_logs` table for analytics/cost attribution.
 */

import { createClient } from '@supabase/supabase-js';
import { isEntitled } from './_lib/entitlement.js';
import {
  availableProviders,
  providerKey,
  resolveModel,
  shouldFailover,
  type Provider,
} from './_providers.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_TRANSCRIBE_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// Whisper models the transcription proxy will forward. The client may request
// either; anything else silently resolves to whisper-large-v3.
const ALLOWED_TRANSCRIBE_MODELS = new Set(['whisper-large-v3', 'whisper-large-v3-turbo']);
const DEFAULT_TRANSCRIBE_MODEL = 'whisper-large-v3';

// Decoded audio size cap (Groq's own limit is 25 MB — leave headroom).
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

// Server-side key only. VITE_GROQ_API_KEY is a build-time fallback so the
// function keeps working before GROQ_API_KEY is set in the dashboard — it is
// never returned to the client.
function getGroqKey(): string {
  return process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
}

const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_TOKENS = 8192;

// Per-user rate limit (in addition to the per-IP bucket in _middleware.ts).
// In-memory like the rest of the app's limiting — swap for Redis/Upstash
// when the platform outgrows a single region.
const USER_RATE_LIMIT_WINDOW = 60_000;
const USER_RATE_LIMIT_MAX = 60;
const userRateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkUserRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = userRateLimitStore.get(userId);
  if (!entry || now > entry.resetAt) {
    userRateLimitStore.set(userId, { count: 1, resetAt: now + USER_RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: USER_RATE_LIMIT_MAX - 1 };
  }
  entry.count++;
  return {
    allowed: entry.count <= USER_RATE_LIMIT_MAX,
    remaining: Math.max(0, USER_RATE_LIMIT_MAX - entry.count),
  };
}

interface AiBody {
  model?: unknown;
  messages?: unknown;
  temperature?: unknown;
  max_tokens?: unknown;
}

/** Loosely typed request/response so this works behind both Vercel's
 *  catch-all (VercelResponse) and the standalone Express server (express.Response). */
interface AiRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface AiResponse {
  status: (code: number) => AiResponse;
  setHeader: (name: string, value: string) => AiResponse;
  json: (body: Record<string, unknown>) => void;
  send: (body: string) => void;
  write: (chunk: string) => void;
  end: () => void;
  flushHeaders?: () => void;
}

export async function handleAI(
  req: AiRequest,
  res: AiResponse,
  action?: string,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (action !== 'chat' && action !== 'chat/stream') {
    res.status(400).json({ error: 'Invalid AI action. Use: chat, chat/stream' });
    return;
  }

  // Any configured provider is enough — Groq is the preferred first hop, not
  // a requirement. Gating on GROQ_API_KEY here would have taken the whole
  // endpoint down even with Cerebras/Gemini/OpenRouter keys present.
  if (availableProviders().length === 0) {
    res.status(503).json({ error: 'AI service is not configured on the server' });
    return;
  }

  // Authenticate the caller with their Supabase session token.
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing authorization' });
    return;
  }
  const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Missing authorization' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Entitlement. A valid session alone used to be enough to reach the model
  // proxy, so any free signup could spend the AI budget at 60 req/min without
  // ever paying — the UI gates on subscription state but a scripted caller
  // holding a session token does not go through the UI.
  //
  // Read from app_metadata via the shared helper: it is service-role only,
  // unlike user_metadata which the user can write themselves.
  if (!isEntitled(user)) {
    res.status(402).json({
      error: 'A subscription is required to use AI features.',
      code: 'subscription_required',
    });
    return;
  }

  // Per-user rate limit.
  const userLimit = checkUserRateLimit(user.id);
  res.setHeader('X-RateLimit-Remaining', String(userLimit.remaining));
  if (!userLimit.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait before sending another message.' });
    return;
  }

  // Validate + clamp the payload (never forward unknown fields).
  const body = (req.body ?? {}) as AiBody;
  let candidates: any[] = Array.isArray(body.messages) ? body.messages : [];
  if (candidates.length === 0) {
    res.status(400).json({ error: 'messages array is required' });
    return;
  }
  // Cap the conversation while always keeping the system prompt: a long chat
  // session would otherwise push the instructions out of the window and
  // silently change the model's behaviour.
  if (candidates.length > MAX_MESSAGES) {
    const sysIdx = candidates.findIndex((m: any) => m?.role === 'system');
    const sys = sysIdx >= 0 ? [candidates[sysIdx]] : [];
    const rest = candidates.filter((_: any, i: number) => i !== sysIdx);
    candidates = [...sys, ...rest.slice(-(MAX_MESSAGES - sys.length))];
  }

  const messages = candidates
    .map((m: any) => ({
      role: typeof m?.role === 'string' && ['system', 'user', 'assistant', 'tool'].includes(m.role)
        ? m.role
        : 'user',
      content: typeof m?.content === 'string' ? m.content.slice(0, MAX_MESSAGE_LENGTH) : '',
    }))
    .filter((m: { content: string }) => m.content.length > 0);

  if (messages.length === 0) {
    res.status(400).json({ error: 'messages array cannot be empty' });
    return;
  }

  const temperature = typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 2) : 0.7;
  const max_tokens = typeof body.max_tokens === 'number'
    ? Math.min(Math.max(Math.floor(body.max_tokens), 1), MAX_TOKENS)
    : 2000;
  const stream = action === 'chat/stream';

  const startTime = Date.now();
  let tokensGenerated = 0;
  let responsePreview = '';
  let streamFailed = false;
  // Which model actually answered. Set when a provider succeeds so the
  // chat_logs row reflects what ran, not what was requested — with failover
  // those can differ. (A `provider` column would sharpen cost attribution
  // further, but that needs a migration.)
  let servedModel = '';

  try {
    // Failover across every provider that has a key configured. On
    // 429 / 401 / 403 / 5xx the next provider takes over, so a spent free
    // quota degrades to a different free tier instead of an outage.
    //
    // Nothing is written to `res` until a provider answers OK, which is what
    // keeps the retry invisible to the client: streaming headers are only
    // sent once we hold a live upstream body.
    const providers = availableProviders();
    if (providers.length === 0) {
      const message =
        'No AI provider configured. Set at least one of GROQ_API_KEY, ' +
        'CEREBRAS_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.';
      if (stream) {
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.status(503).setHeader('Content-Type', 'application/json').send(JSON.stringify({ error: message }));
      }
      streamFailed = true;
      return;
    }

    let upstream: Response | null = null;
    let served: Provider | null = null;
    let lastStatus = 502;
    let lastMessage = 'All AI providers failed.';

    for (const provider of providers) {
      const attemptModel = resolveModel(provider, body.model);
      const attemptBody = JSON.stringify({
        model: attemptModel,
        messages,
        temperature,
        max_tokens,
        ...(stream ? { stream: true } : {}),
      });

      let attempt: Response;
      try {
        attempt = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${providerKey(provider)}`,
            ...(provider.extraHeaders ?? {}),
          },
          body: attemptBody,
        });
      } catch (netErr: any) {
        // A network-level failure is exactly what the next provider is for.
        lastStatus = 502;
        lastMessage = `${provider.name} unreachable: ${netErr?.message || 'network error'}`;
        console.warn(`[ai] ${provider.name} unreachable, trying next provider`);
        continue;
      }

      if (attempt.ok) {
        upstream = attempt;
        served = provider;
        servedModel = attemptModel;
        break;
      }

      lastStatus = attempt.status;
      lastMessage = (await attempt.text().catch(() => '')).slice(0, 500)
        || `Upstream error (${attempt.status})`;

      if (!shouldFailover(attempt.status)) {
        // A 400 is our own malformed request: it fails identically everywhere,
        // so stop rather than burn the other providers' free quota.
        break;
      }
      console.warn(`[ai] ${provider.name} returned ${attempt.status}, failing over`);
    }

    if (!upstream || !served) {
      // Preserve the last upstream status so the client's typed error
      // classification (auth / 429 / 5xx) keeps working unchanged.
      if (stream) {
        res.write(`data: ${JSON.stringify({ error: lastMessage })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.status(lastStatus).setHeader('Content-Type', 'application/json').send(JSON.stringify({ error: lastMessage }));
      }
      streamFailed = true;
      return;
    }

    // Lets the client tell the user which free tier answered, and makes
    // failover visible in logs and devtools instead of silent.
    res.setHeader('x-ai-provider', served.name);

    if (!stream) {
      const jsonBody = await upstream.json();
      const content: string = jsonBody?.choices?.[0]?.message?.content ?? '';
      responsePreview = content.slice(0, 500);
      tokensGenerated = typeof jsonBody?.usage?.completion_tokens === 'number'
        ? jsonBody.usage.completion_tokens
        : 0;
      res.status(200).setHeader('Content-Type', 'application/json').send(JSON.stringify(jsonBody));
      return;
    }

    // Streaming: forward OpenAI-style SSE deltas verbatim.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    const reader = upstream.body?.getReader();
    if (!reader) {
      res.write(`data: ${JSON.stringify({ error: 'Failed to read AI response stream' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      streamFailed = true;
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let sawDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          sawDone = true;
          res.write('data: [DONE]\n\n');
          continue;
        }
        res.write(`data: ${payload}\n\n`);
        tokensGenerated++;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string') responsePreview += delta;
        } catch {
          // skip malformed SSE lines
        }
      }
    }

    if (!sawDone) res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    console.error('[AIHandler] proxy error:', err);
    if (stream) {
      res.write(`data: ${JSON.stringify({ error: 'Connection to AI service failed' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    } else {
      res.status(502).setHeader('Content-Type', 'application/json').send(
        JSON.stringify({ error: err?.message || 'AI service unavailable' }),
      );
    }
    streamFailed = true;
  } finally {
    // Best-effort usage logging for analytics / cost attribution.
    try {
      await supabase.from('chat_logs').insert({
        user_id: user.id,
        messages: messages as any,
        response_preview: responsePreview.slice(0, 500),
        tokens_generated: tokensGenerated,
        model: servedModel,
        duration_ms: Date.now() - startTime,
        success: !streamFailed,
        error_message: streamFailed ? 'AI proxy failed' : null,
        created_at: new Date().toISOString(),
      });
    } catch (logErr: any) {
      console.error('[AIHandler] Failed to log AI call:', logErr.message);
    }
  }
}

interface TranscribeBody {
  audioBase64?: unknown;
  filename?: unknown;
  model?: unknown;
  language?: unknown;
}

/**
 * POST /api/ai/transcribe — audio → text via Groq Whisper.
 *
 * The client sends base64 audio as JSON (browser-side this avoids a raw
 * multipart upload through the proxy); the server rebuilds the FormData and
 * forwards to api.groq.com with the server-side key. Same auth, per-user
 * rate limit and status-code passthrough as the chat endpoints.
 */
export async function handleAITranscribe(
  req: AiRequest,
  res: AiResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const groqKey = getGroqKey();
  if (!groqKey) {
    res.status(503).json({ error: 'AI service is not configured on the server' });
    return;
  }

  // Authenticate the caller with their Supabase session token.
  const authHeader = req.headers?.authorization;
  const token = String(authHeader ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Missing authorization' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  // Entitlement, same as chat: without this any signed-in free account could
  // spend the server-side Whisper budget. Read from app_metadata via the
  // shared helper — user_metadata is client-writable and must not gate spend.
  if (!isEntitled(user)) {
    res.status(402).json({
      error: 'A subscription is required to use AI features.',
      code: 'subscription_required',
    });
    return;
  }

  // Per-user rate limit.
  const userLimit = checkUserRateLimit(user.id);
  res.setHeader('X-RateLimit-Remaining', String(userLimit.remaining));
  if (!userLimit.allowed) {
    res.status(429).json({ error: 'Rate limit exceeded. Please wait before sending another message.' });
    return;
  }

  const body = (req.body ?? {}) as TranscribeBody;
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64.trim() : '';
  if (!audioBase64) {
    res.status(400).json({ error: 'audioBase64 is required' });
    return;
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, 'base64');
  } catch {
    res.status(400).json({ error: 'audioBase64 is not valid base64' });
    return;
  }
  if (audioBuffer.length === 0) {
    res.status(400).json({ error: 'audio payload is empty' });
    return;
  }
  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: 'audio payload exceeds the 20 MB limit' });
    return;
  }

  const model =
    typeof body.model === 'string' && ALLOWED_TRANSCRIBE_MODELS.has(body.model)
      ? body.model
      : DEFAULT_TRANSCRIBE_MODEL;
  const filename =
    typeof body.filename === 'string' && /^[\w.-]{1,120}$/.test(body.filename)
      ? body.filename
      : 'recording.webm';
  const language = typeof body.language === 'string' && /^[a-zA-Z-]{2,10}$/.test(body.language)
    ? body.language
    : 'en';

  const form = new FormData();
  const audioBytes = new Uint8Array(audioBuffer.length);
  audioBytes.set(audioBuffer);
  form.append('file', new Blob([audioBytes.buffer as ArrayBuffer]), filename);
  form.append('model', model);
  form.append('language', language);

  const startTime = Date.now();
  let responsePreview = '';
  let failed = false;

  try {
    const upstream = await fetch(GROQ_TRANSCRIBE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
    });

    if (!upstream.ok) {
      const errText = (await upstream.text().catch(() => '')).slice(0, 500);
      const message = errText || `Upstream error (${upstream.status})`;
      res.status(upstream.status).setHeader('Content-Type', 'application/json')
        .send(JSON.stringify({ error: message }));
      failed = true;
      return;
    }

    const json = await upstream.json();
    const text: string = typeof json?.text === 'string' ? json.text : '';
    responsePreview = text.slice(0, 200);
    res.status(200).setHeader('Content-Type', 'application/json')
      .send(JSON.stringify({ text }));
  } catch (err: any) {
    console.error('[AIHandler] transcription proxy error:', err);
    res.status(502).setHeader('Content-Type', 'application/json')
      .send(JSON.stringify({ error: err?.message || 'AI service unavailable' }));
    failed = true;
  } finally {
    try {
      await supabase.from('chat_logs').insert({
        user_id: user.id,
        messages: [],
        response_preview: responsePreview,
        tokens_generated: 0,
        model,
        duration_ms: Date.now() - startTime,
        success: !failed,
        error_message: failed ? 'transcription failed' : null,
        created_at: new Date().toISOString(),
      });
    } catch (logErr: any) {
      console.error('[AIHandler] Failed to log transcription:', logErr.message);
    }
  }
}