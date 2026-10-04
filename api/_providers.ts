/**
 * Free-tier AI provider registry with automatic failover.
 *
 * Every provider here speaks the OpenAI chat-completions shape, so one
 * request body and one response parser cover all of them — including Gemini,
 * which Google exposes at an OpenAI-compatible path. No per-provider adapter.
 *
 * Ordering is deliberate: cheapest-and-fastest first, then breadth. A
 * provider is skipped entirely when its key is unset, so adding a provider
 * is "set the env var" and removing one is "unset it" — no code change and
 * no redeploy of the client.
 *
 * The client never chooses a provider or a model. It may request a model
 * name, which is honoured only if the *selected* provider allowlists it;
 * otherwise that provider's default is used. A stale bundle can therefore
 * never steer the server onto a pricier model or a provider that costs money.
 *
 * MODEL IDS: the defaults below were not verified against live APIs (that
 * needs keys we don't have here). Every one is overridable by env var, so if
 * a provider renames or retires a model, change the variable rather than the
 * code. A 404/400 naming a model is the signal to update it.
 */

import { APP_ORIGIN } from './_lib/origin.js';

/**
 * Product name for OpenRouter's optional attribution header. Read from the
 * server's env rather than duplicated here — it only affects how requests are
 * labelled on a third-party dashboard, so a stale value is harmless, but it
 * should still track the real name.
 */
const APP_NAME = process.env.APP_NAME || 'BonaMind';

export interface Provider {
  /** Stable identifier used in logs and the `x-ai-provider` response header. */
  name: string;
  /** OpenAI-compatible chat-completions endpoint. */
  url: string;
  /** Env var holding the API key. Provider is skipped when unset. */
  keyEnv: string;
  /** Env var overriding the default model. */
  modelEnv: string;
  /** Model used when `modelEnv` is unset. */
  defaultModel: string;
  /** Models this provider will accept from the client. Others fall back to defaultModel. */
  allowedModels: ReadonlySet<string>;
  /** Extra headers some providers require. */
  extraHeaders?: Record<string, string>;
}

const PROVIDERS: readonly Provider[] = [
  {
    // Existing provider — stays first so current behaviour is unchanged
    // whenever Groq is healthy.
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'openai/gpt-oss-120b',
    allowedModels: new Set([
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-safeguard-20b',
      'qwen/qwen3.6-27b',
      'groq/compound',
      'groq/compound-mini',
    ]),
  },
  {
    // Free tier, comparable latency to Groq.
    name: 'cerebras',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    keyEnv: 'CEREBRAS_API_KEY',
    modelEnv: 'CEREBRAS_MODEL',
    defaultModel: 'llama-3.3-70b',
    allowedModels: new Set(['llama-3.3-70b', 'llama3.1-8b']),
  },
  {
    // Google's OpenAI-compatible surface. Generous free tier via an AI Studio
    // key; the /openai/ path is what makes an adapter unnecessary.
    name: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    keyEnv: 'GEMINI_API_KEY',
    modelEnv: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.0-flash',
    allowedModels: new Set(['gemini-2.0-flash', 'gemini-2.0-flash-lite']),
  },
  {
    // Last resort: broadest model choice, and the `:free` models cost nothing.
    // Also the easiest place to A/B a different model without a redeploy.
    name: 'openrouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    keyEnv: 'OPENROUTER_API_KEY',
    modelEnv: 'OPENROUTER_MODEL',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    allowedModels: new Set([
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-2-9b-it:free',
      'qwen/qwen-2.5-7b-instruct:free',
    ]),
    extraHeaders: {
      // OpenRouter attributes traffic with these; both are optional but
      // keep the app identifiable on their dashboard.
      'HTTP-Referer': APP_ORIGIN,
      'X-Title': APP_NAME,
    },
  },
];

/** Providers with a key configured, in failover order. */
export function availableProviders(): Provider[] {
  return PROVIDERS.filter((p) => Boolean(process.env[p.keyEnv]));
}

/** The API key for a provider (empty string when unset). */
export function providerKey(p: Provider): string {
  return process.env[p.keyEnv] || '';
}

/**
 * Resolve the model for one provider. The client's request is honoured only
 * when that provider allowlists it — otherwise the provider's own default
 * wins, so a request naming a Groq model doesn't reach Gemini as-is.
 */
export function resolveModel(p: Provider, requested: unknown): string {
  const fallback = process.env[p.modelEnv] || p.defaultModel;
  return typeof requested === 'string' && p.allowedModels.has(requested) ? requested : fallback;
}

/**
 * Whether a failed upstream response should advance to the next provider.
 *
 * 429 (rate limited / free quota spent) and 5xx (provider down) are the
 * whole point of failover. 401/403 means that provider's key is bad — also
 * worth failing past, since a misconfigured key shouldn't take the app down
 * while other providers are healthy. A 400 is our own malformed request and
 * will fail identically everywhere, so it is returned to the caller as-is.
 */
export function shouldFailover(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status >= 500;
}
