import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Seeded specs mint real accounts with the service-role key, read by
 * scripts/e2e-seed-session.mjs from the shell or the repo-root .env. CI has
 * neither (and should not create accounts in the live project), so those
 * specs skip there instead of failing.
 */
function rootEnvHas(name: string): boolean {
  try {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
    const raw = readFileSync(resolve(root, '.env'), 'utf8');
    return new RegExp(`^\\s*${name}\\s*=\\s*\\S`, 'm').test(raw);
  } catch {
    return false;
  }
}

const has = (name: string) => Boolean(process.env[name]) || rootEnvHas(name);

export const canSeedSessions =
  has('SUPABASE_SERVICE_ROLE_KEY') && (has('SUPABASE_URL') || has('VITE_SUPABASE_URL'));

export const SEED_SKIP_REASON =
  'needs SUPABASE_SERVICE_ROLE_KEY (shell or repo-root .env) to seed accounts';
