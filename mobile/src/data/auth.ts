import type { Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { getSupabase } from './supabase';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';
export interface AuthState { status: AuthStatus; session: Session | null; userId: string | null }

let state: AuthState = { status: 'loading', session: null, userId: null };
const listeners = new Set<() => void>();
let started = false;

function set(session: Session | null) {
  state = { status: session ? 'signed-in' : 'signed-out', session, userId: session?.user.id ?? null };
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  started = true;
  const supabase = getSupabase();
  supabase.auth.getSession().then(({ data }) => set(data.session)).catch(() => set(null));
  supabase.auth.onAuthStateChange((_event, session) => set(session));
}

export function useAuth(): AuthState {
  start();
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export function getAuthState(): AuthState {
  return state;
}

export type SignInError = 'invalid_credentials' | 'captcha_failed' | 'invalid_code' | 'network' | 'unknown';

function classify(error: { code?: string; name?: string; message?: string } | null): SignInError | undefined {
  if (!error) return undefined;
  if (error.code === 'invalid_credentials') return 'invalid_credentials';
  if (error.code === 'captcha_failed' || /captcha/i.test(error.message ?? '')) return 'captcha_failed';
  if (error.code === 'otp_expired' || error.code === 'otp_disabled') return 'invalid_code';
  if (error.name === 'AuthRetryableFetchError' || /network/i.test(error.message ?? '')) return 'network';
  return 'unknown';
}

export async function signInWithPassword(email: string, password: string, captchaToken: string) {
  const { error } = await getSupabase().auth.signInWithPassword({ email, password, options: { captchaToken } });
  return { error: classify(error) };
}

export async function sendEmailCode(email: string, captchaToken: string) {
  const { error } = await getSupabase().auth.signInWithOtp({ email, options: { captchaToken, shouldCreateUser: true } });
  return { error: classify(error) };
}

export async function verifyEmailCode(email: string, code: string) {
  const { error } = await getSupabase().auth.verifyOtp({ email, token: code, type: 'email' });
  return { error: classify(error) };
}

export async function signOut() {
  await getSupabase().auth.signOut();
}
