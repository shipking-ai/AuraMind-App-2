// CI only: signs the end-to-end test account in server-side (no captcha) and
// writes its refresh token to $GITHUB_OUTPUT as `rt`, masked in logs. Also
// records `since`, the instant before the run, for verify-reviews.mjs.
import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_EMAIL;
if (!url || !serviceKey || !email) throw new Error('EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and E2E_EMAIL are required');

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (linkError) throw linkError;
const { data, error } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
if (error || !data.session) throw error ?? new Error('no session');

const rt = data.session.refresh_token;
console.log(`::add-mask::${rt}`);
const out = process.env.GITHUB_OUTPUT;
const lines = `rt=${rt}\nsince=${new Date().toISOString()}\nuser=${data.session.user.id}\n`;
if (out) appendFileSync(out, lines);
else console.log('minted a session (no GITHUB_OUTPUT; not printing the token)');
