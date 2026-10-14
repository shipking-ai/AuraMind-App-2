import { readClientEnv } from './env';
/**
 * Single source of truth for AI provider selection (cloud vs on-device).
 *
 * The runtime preference lives in localStorage so a user can switch providers
 * in Settings without touching .env. It falls back to the build-time
 * VITE_USE_LOCAL_AI flag, which developers and tests set via vi.stubEnv /
 * .env.mobile. Keep this module dependency-free — both groqClient and
 * bonaAiService import it.
 */

export type AIProvider = 'cloud' | 'local';

const STORAGE_KEY = 'bonamind_ai_provider';

function readEnv(key: string): string | undefined {
// Allowlisted read — see CLIENT_ENV in lib/env.ts. Dynamic indexing of
// import.meta.env makes Vite inline every VITE_ var into the bundle.
  return readClientEnv(key);
}

/** The provider the user has chosen for this session. */
export function getAIProvider(): AIProvider {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'local' || stored === 'cloud') return stored;
    }
  } catch {
    // storage unavailable (SSR / privacy mode) — fall through to env
  }
  return readEnv('VITE_USE_LOCAL_AI') === 'true' ? 'local' : 'cloud';
}

/** Persist the provider choice. No-op when storage is unavailable. */
export function setAIProvider(provider: AIProvider): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, provider);
    }
  } catch {
    // storage unavailable — the preference simply won't persist
  }
}

/** True when the on-device WebLLM engine should be used. */
export function usesLocalAI(): boolean {
  return getAIProvider() === 'local';
}

/** True when AI calls should route through the server-side proxy. */
export function usesCloudProxy(): boolean {
  return getAIProvider() === 'cloud';
}
