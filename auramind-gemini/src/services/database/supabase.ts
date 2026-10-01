import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDesktopApp } from '../../lib/platform';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True when the value is a well-formed http(s) URL the Supabase client accepts. */
function isValidSupabaseUrl(value: string | undefined): value is string {
    if (!value) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

if (!isValidSupabaseUrl(supabaseUrl) || !supabaseAnonKey) {
    console.warn('Supabase environment variables are missing or invalid. Some features may not work properly.');
}

/**
 * The Supabase client, or `null` when the environment variables are absent,
 * malformed, or the client fails to initialize.
 *
 * This module is imported at startup, so initialization must never throw:
 * a bad env value (e.g. a Vercel `[SENSITIVE]` placeholder) used to crash
 * the entire app before React mounted.
 *
 * Prefer `requireSupabase()` in service code. Use this nullable export only
 * where the caller genuinely handles the unconfigured case (feature
 * detection, optional analytics, boot-time diagnostics).
 */
export const supabase: SupabaseClient | null = (() => {
    if (!isValidSupabaseUrl(supabaseUrl) || !supabaseAnonKey) return null;
    try {
        // The Windows app finishes OAuth through auramind://auth/callback,
        // which needs PKCE (the code is useless without the verifier stored
        // in this origin). Web and mobile keep the current flow.
        return createClient(
            supabaseUrl,
            supabaseAnonKey,
            isDesktopApp() ? { auth: { flowType: 'pkce' } } : undefined,
        );
    } catch (err) {
        console.warn('Failed to initialize Supabase client:', err);
        return null;
    }
})();

/** True when both Supabase env vars were present at startup. */
export const isSupabaseConfigured = supabase !== null;

/**
 * Returns the Supabase client, throwing a clear, actionable error when it
 * is not configured.
 *
 * Without this, a missing env var surfaces as "Cannot read properties of
 * null (reading 'from')" from deep inside an unrelated query chain. Every
 * data-access path in the app requires a client, so failing loudly at the
 * call site is both safer and far easier to diagnose.
 */
export function requireSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error(
            'Supabase is not configured. Set VITE_SUPABASE_URL and ' +
            'VITE_SUPABASE_ANON_KEY in your environment (.env.local locally, ' +
            'Project Settings → Environment Variables on Vercel).',
        );
    }
    return supabase;
}
