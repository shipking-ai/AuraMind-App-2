import { createSign } from 'node:crypto';

/**
 * FCM HTTP v1 sender — the server half of the push system.
 *
 * The client half (`src/services/notifications/pushService.ts`) registers
 * device tokens into `public.push_tokens`; this module delivers to them.
 * Uses the v1 API with a service-account JWT signed by node:crypto, so no
 * firebase-admin dependency (phantom-dep trap: every dep must be declared,
 * and crypto does this fine).
 *
 * CREDENTIALS — fails closed like every other integration:
 *   FCM_PROJECT_ID             the Firebase project id
 *   FCM_SERVICE_ACCOUNT_KEY    the FULL service-account key JSON (raw or
 *                              base64), for a role with
 *                              firebase-messaging(sender). Env var rather
 *                              than a file because Vercel has no disk.
 *
 * When either is missing, isPushConfigured() is false and sendPush() returns
 * a `configured: false` report without touching the network — callers treat
 * that as "nothing to do", not an error.
 *
 * Token hygiene: FCM answers UNREGISTERED for tokens the device has rotated
 * or the app was uninstalled from. Those rows are deleted so the table
 * doesn't fill with dead weights that slow every future send.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
/** Access tokens live 3600s; refresh 60s early to dodge clock skew. */
const TOKEN_TTL_MS = 55 * 60 * 1000;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedAccessToken: CachedToken | null = null;

export interface PushConfig {
  projectId: string;
  account: ServiceAccount;
}

export function isPushConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.FCM_PROJECT_ID && env.FCM_SERVICE_ACCOUNT_KEY);
}

/** Accepts raw JSON or base64 (Vercel dashboards can mangle newlines). */
export function parseServiceAccountKey(raw: string): ServiceAccount | null {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  try {
    const parsed = JSON.parse(text) as ServiceAccount;
    if (parsed.client_email && parsed.private_key) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function readPushConfig(env: NodeJS.ProcessEnv = process.env): PushConfig | null {
  const projectId = env.FCM_PROJECT_ID;
  const rawKey = env.FCM_SERVICE_ACCOUNT_KEY;
  if (!projectId || !rawKey) return null;
  const account = parseServiceAccountKey(rawKey);
  if (!account) return null;
  return { projectId, account };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

/**
 * OAuth2 access token for the FCM v1 scope, minted from the service account
 * with an RS256 JWT. Cached until shortly before expiry — serverless invocations
 * reuse the module scope within a warm lambda.
 */
export async function getAccessToken(config: PushConfig, now = Date.now()): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > now) return cachedAccessToken.token;

  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const iat = Math.floor(now / 1000);
  const claims = base64url(
    JSON.stringify({
      iss: config.account.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = base64url(signer.sign(config.account.private_key));

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`FCM token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('FCM token exchange returned no access_token');
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ? data.expires_in * 1000 : TOKEN_TTL_MS) - 60_000,
  };
  return cachedAccessToken.token;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Deep link carried in `data`; the client routes `auramind://` links on tap. */
  link?: string;
}

export interface PushReport {
  configured: boolean;
  sent: number;
  failed: number;
  /** Tokens removed because FCM reported them dead. */
  pruned: number;
  /** Skipped because the user has no (live) tokens, or push is unconfigured. */
  skipped: number;
  errors: string[];
}

const MAX_TOKENS_PER_USER = 5;

/** Dead-token OAuth/FCM error signatures worth pruning on. */
function isPrunableError(status: number, detail: string): boolean {
  if (status === 404) return true; // unregistered token
  if (status === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(detail)) return true;
  return false;
}

/**
 * Send to every live token owned by the given users. Never throws for
 * per-token failures — those land in the report. Network/config failures
 * throw only when they make the whole run meaningless (e.g. token exchange),
 * and callers treat a thrown error as "push unavailable this run".
 */
export async function sendPushToUsers(
  supabase: any,
  userIds: string[],
  payload: PushPayload,
  config: PushConfig | null = readPushConfig(),
): Promise<PushReport> {
  const report: PushReport = { configured: true, sent: 0, failed: 0, pruned: 0, skipped: 0, errors: [] };
  if (!config) return { ...report, configured: false };
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return report;

  const { data: rows, error } = await supabase
    .from('push_tokens')
    .select('user_id, token')
    .in('user_id', ids);
  if (error) {
    report.errors.push(`push_tokens query failed: ${error.message}`);
    return report;
  }
  const byUser = new Map<string, string[]>();
  for (const row of rows ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    if (list.length < MAX_TOKENS_PER_USER) list.push(row.token);
    byUser.set(row.user_id, list);
  }

  let accessToken: string | null = null;
  for (const userId of ids) {
    const tokens = byUser.get(userId);
    if (!tokens || tokens.length === 0) {
      report.skipped += 1;
      continue;
    }
    for (const token of tokens) {
      try {
        accessToken ??= await getAccessToken(config);
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
            body: JSON.stringify({
              message: {
                token,
                notification: { title: payload.title, body: payload.body },
                ...(payload.link ? { data: { link: payload.link } } : {}),
                android: { priority: 'HIGH' },
              },
            }),
          },
        );
        if (res.ok) {
          report.sent += 1;
          continue;
        }
        const detail = (await res.text()).slice(0, 300);
        if (isPrunableError(res.status, detail)) {
          const { error: delError } = await supabase
            .from('push_tokens')
            .delete()
            .eq('token', token);
          if (delError) report.errors.push(`prune failed for a dead token: ${delError.message}`);
          else report.pruned += 1;
        } else {
          report.failed += 1;
          report.errors.push(`FCM ${res.status}: ${detail}`);
        }
      } catch (err: any) {
        report.failed += 1;
        report.errors.push(String(err?.message || err).slice(0, 200));
      }
    }
  }
  return report;
}
