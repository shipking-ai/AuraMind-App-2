import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyMiddleware } from './_middleware.js';
import { distributedLimiterConfigured } from './_rateLimit.js';
import { handleAI, handleAITranscribe } from './_aiHandler.js';
import { z } from 'zod';
import { sendEmail as sendEmailViaResend, sendCustomEmail } from './_lib/emails.js';
import { readSubscriptionStatus } from './_lib/entitlement.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

// Roles that grant admin access. Authorization reads app_metadata ONLY:
// user_metadata is writable by any signed-in client via auth.updateUser(),
// so trusting it would let any user self-promote to admin. app_metadata can
// only be written with the service-role key (i.e. by this API).
const ADMIN_ROLES = new Set(['owner', 'ceo', 'admin']);

function isAdminUser(user: { email?: string | null; app_metadata?: Record<string, unknown> } | null | undefined): boolean {
  if (!user) return false;
  if (ADMIN_EMAIL && user.email === ADMIN_EMAIL) return true;
  const role = user.app_metadata?.role;
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

// Rate-limit bucket per endpoint. Anything that spends money on an
// outbound call (model inference, transcription, web search, URL and
// transcript fetching) belongs in the tighter `ai` bucket; `default` is
// only for endpoints that just touch our own database.
const RATE_LIMIT_BUCKETS: Record<string, 'default' | 'ai' | 'auth'> = {
  ai: 'ai',
  search: 'ai',
  'fetch-url': 'ai',
  'fetch-youtube-transcript': 'ai',
  stripe: 'auth',
};

const json = (res: VercelResponse, status: number, body: Record<string, unknown>) => {
  res.status(status).setHeader('Content-Type', 'application/json').send(JSON.stringify(body));
};

// --- Zod Validation Schemas ---

const StripeCheckoutSchema = z.object({
  priceId: z.string().min(1, 'priceId is required'),
  // Deprecated: kept for client backward-compat. The server always derives
  // identity from the bearer token so a caller can never provision checkout
  // (or the immediate trialing flag) for someone else's account.
  userId: z.string().uuid('userId must be a valid UUID').optional(),
  email: z.string().email('email must be valid').optional(),
});

const StripePortalSchema = z.object({
  customerId: z.string().min(1, 'customerId is required'),
});

const AdminToggleSchema = z.object({
  targetUserId: z.string().uuid('targetUserId must be a valid UUID'),
  makeAdmin: z.boolean(),
});

const AdminSetRoleSchema = z.object({
  targetUserId: z.string().uuid(),
  testData: z.object({
    role: z.enum(['user', 'tester', 'employee', 'admin', 'ceo', 'owner']).optional(),
  }).optional(),
});

const AdminSetSubscriptionSchema = z.object({
  targetUserId: z.string().uuid(),
  testData: z.object({
    status: z.enum(['active', 'trialing', 'past_due', 'canceled', 'none']).optional(),
    plan: z.string().optional(),
  }).optional(),
});

const CreateTestUserSchema = z.object({
  testData: z.object({
    email: z.string().email(),
    password: z.string().min(8, 'password must be at least 8 characters'),
    makeAdmin: z.boolean().optional(),
    role: z.enum(['user', 'tester', 'employee', 'admin', 'ceo', 'owner']).optional(),
  }),
});

const CouponCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'name is required'),
  percent_off: z.union([z.string(), z.number()]).optional(),
  amount_off: z.union([z.string(), z.number()]).optional(),
  duration: z.enum(['once', 'repeating', 'forever']).optional(),
  duration_in_months: z.union([z.string(), z.number()]).optional(),
});

const CouponDeleteSchema = z.object({
  couponId: z.string().min(1, 'couponId is required'),
});

const SubscriptionVerifySchema = z.object({
  // Deprecated: the server derives the user from the bearer token. Kept
  // optional so older clients keep validating while we roll out auth.
  userId: z.string().uuid('userId must be a valid UUID').optional(),
});

const AdminQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(5000, 'Query too long'),
});

const AuditListSchema = z.object({
  limit: z.number().min(1).max(500).optional().default(100),
  offset: z.number().min(0).optional().default(0),
  category: z.enum(['user', 'subscription', 'admin', 'database', 'system', 'security']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
});

const AuditCreateSchema = z.object({
  action: z.string().min(1, 'action is required'),
  category: z.enum(['user', 'subscription', 'admin', 'database', 'system', 'security']),
  actorEmail: z.string().email('actorEmail must be valid'),
  targetId: z.string().optional(),
  targetEmail: z.string().optional(),
  details: z.string().optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional().default('info'),
});

const BulkRoleChangeSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1, 'At least one userId is required').max(100, 'Max 100 users at a time'),
  role: z.enum(['user', 'tester', 'employee', 'admin']),
});

const BulkEmailSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(100),
  subject: z.string().min(1, 'Subject is required').max(200),
  body: z.string().min(1, 'Body is required').max(50000),
});

const SearchRequestSchema = z.object({
  query: z.string().min(1, 'query is required').max(500, 'Query too long'),
  maxResults: z.number().int().min(1).max(10).optional().default(10),
  safeSearch: z.boolean().optional(),
});

const EmailRequestSchema = z.object({
  type: z.enum(['welcome', 'signInAlert', 'trialEnding', 'paymentSuccess', 'paymentFailed', 'subscriptionCancelled', 'passwordReset', 'emailVerification']),
  to: z.string().email('to must be a valid email'),
  origin: z.string().url('origin must be a valid URL').optional(),
  name: z.string().max(200).optional(),
  timestamp: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  device: z.string().max(200).optional(),
  trialEnds: z.string().max(200).optional(),
  daysRemaining: z.number().int().min(0).max(3650).optional(),
  amount: z.string().max(100).optional(),
  plan: z.string().max(100).optional(),
  nextBilling: z.string().max(200).optional(),
  lastAttempt: z.string().max(200).optional(),
  effectiveDate: z.string().max(200).optional(),
  resetLink: z.string().url().optional(),
  verificationLink: z.string().url().optional(),
  expiresIn: z.string().max(200).optional(),
});

const ExportCSVSchema = z.object({
  columns: z.array(z.string()).optional(),
  format: z.enum(['csv', 'json']).optional().default('csv'),
});

// Allowed SQL prefixes for read-only queries
const ALLOWED_QUERY_PREFIXES = ['SELECT', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'WITH'];
const BLOCKED_KEYWORDS = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL', 'DO', 'MERGE', 'UPSERT', 'COPY'];

/**
 * Validates req.body against a Zod schema. Returns parsed data or sends 400 error.
 */
function validateBody<T extends z.ZodTypeAny>(
  res: VercelResponse,
  schema: T,
  body: unknown
): { ok: true; data: z.infer<T> } | { ok: false } {
  const result = schema.safeParse(body);
  if (!result.success) {
    json(res, 400, {
      error: 'Validation failed',
      details: (result as any).error?.flatten?.().fieldErrors ?? {},
    });
    return { ok: false };
  }
  return { ok: true, data: result.data };
}

/**
 * Resolves the caller from the Authorization bearer token via Supabase Auth.
 * Returns null after sending a 401 when the token is missing or invalid.
 * Every billing/entitlement route MUST use this instead of trusting body
 * fields — userId/email in a request body is attacker-controlled input.
 */
async function authenticateUser(
  req: VercelRequest,
  res: VercelResponse
): Promise<{ id: string; email?: string; user_metadata: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    json(res, 500, { error: 'Server configuration error' });
    return null;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    json(res, 401, { error: 'Missing authorization' });
    return null;
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    json(res, 401, { error: 'Missing authorization' });
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    json(res, 401, { error: 'Invalid token' });
    return null;
  }
  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
    user_metadata: (data.user.user_metadata as Record<string, unknown>) || {},
    app_metadata: data.user.app_metadata as Record<string, unknown> | undefined,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { path } = req.query;
  
  if (!path || typeof path !== 'string') {
    return json(res, 400, { error: 'Invalid path' });
  }

  // Split into endpoint + remaining action. Using the full remainder (not a
  // single segment) lets nested actions like `chat/stream` and `ai/chat/stream`
  // route correctly through the catch-all.
  const segments = path.split('/');
  const endpoint = segments[0];
  const action = segments.slice(1).join('/');

  // Public liveness probe — respond before middleware so uptime monitors and
  // CI health checks are never rate-limited or blocked by auth. `probe=db`
  // additionally verifies the Supabase connection (used by the status page).
  if (endpoint === 'health') {
    if (req.method !== 'GET') {
      return json(res, 405, { error: 'Method not allowed' });
    }
    const body: Record<string, unknown> = {
      status: 'ok',
      service: 'auramind-api',
      version: '2.0.0',
      timestamp: Date.now(),
      // Surfaced so uptime monitoring can catch the silent-degradation case:
      // without Upstash the limiter falls back to per-instance memory, so on
      // Vercel the effective limit multiplies by the number of warm instances.
      rateLimiter: distributedLimiterConfigured ? 'distributed' : 'in-memory',
    };
    const isProdEnv =
      process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    if (isProdEnv && !distributedLimiterConfigured) {
      body.status = 'degraded';
      body.warning =
        'Rate limiting is per-instance: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.';
    }
    if (req.query.probe === 'db') {
      const dbStart = Date.now();
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
          process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        );
        // Cheap authenticated round trip — verifies URL + key + network.
        const { error } = await supabase.auth.getUser('probe-invalid-token');
        // An invalid token is EXPECTED to error — reaching a Supabase response
        // at all proves connectivity. A network failure throws instead.
        body.database = { status: 'reachable', latencyMs: Date.now() - dbStart, authResponded: !!error };
      } catch (dbErr: any) {
        body.database = { status: 'unreachable', latencyMs: Date.now() - dbStart };
        body.status = 'degraded';
        return json(res, 503, body);
      }
    }
    return json(res, 200, body);
  }

  // Apply security headers and rate limiting. Returns false if already responded.
  if (!(await applyMiddleware(req, res, {
    rateLimitType: RATE_LIMIT_BUCKETS[endpoint] ?? 'default',
  }))) {
    return;
  }

  try {
    // Route to appropriate handler
    switch (endpoint) {
      case 'admin':
        return await handleAdmin(req, res, action);
      case 'coupons':
        return await handleCoupons(req, res, action);
      case 'subscription':
        return await handleSubscription(req, res, action);
      case 'ai':
        if (action === 'transcribe') {
          return await handleAITranscribe(req, res);
        }
        return await handleAI(req, res, action);
      case 'stripe':
        return await handleStripe(req, res, action);
      case 'account':
        return await handleAccount(req, res, action);
      case 'email':
        return await handleEmail(req, res, action);
      case 'search':
        return await handleSearch(req, res);
      case 'audit':
        return await handleAudit(req, res, action);
      case 'integrations':
        return await handleIntegrations(req, res, action);
      case 'fetch-url':
        return await handleFetchUrl(req, res);
      case 'fetch-youtube-transcript':
        return await handleFetchYouTubeTranscript(req, res);
      case 'cron':
        return await handleCron(req, res, action);
      default:
        return json(res, 404, { error: 'Endpoint not found' });
    }
  } catch (err: any) {
    console.error('API Error:', err);
    // Never leak internal error text to clients in production; log it instead.
    const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    return json(res, 500, { error: isProd ? 'Internal server error' : (err.message || 'Internal server error') });
  }
}

// Admin endpoints
async function handleAdmin(req: VercelRequest, res: VercelResponse, action?: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json(res, 401, { error: 'Invalid token' });

  if (!isAdminUser(user)) return json(res, 403, { error: 'Forbidden' });

  switch (action) {
    case 'list':
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const mappedUsers = users.map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.full_name || u.email?.split('@')[0],
        isAdmin: isAdminUser(u),
        role: u.app_metadata?.role || (ADMIN_EMAIL && u.email === ADMIN_EMAIL ? 'owner' : 'user'),
        avatar: u.user_metadata?.avatar_url,
        lastSignIn: u.last_sign_in_at,
        created: u.created_at,
        plan: u.user_metadata?.plan || 'Starter'
      }));
      return json(res, 200, { users: mappedUsers });

    case 'toggle': {
      const parsed = validateBody(res, AdminToggleSchema, req.body);
      if (!parsed.ok) return;
      const { targetUserId, makeAdmin } = parsed.data;

      const { data: targetUser } = await supabase.auth.admin.getUserById(targetUserId);
      if (!targetUser?.user) return json(res, 404, { error: 'User not found' });

      const oldRole = targetUser.user.app_metadata?.role || 'user';
      await supabase.auth.admin.updateUserById(targetUserId, {
        // app_metadata is the authorization source of truth (service-role only).
        app_metadata: {
          ...targetUser.user.app_metadata,
          role: makeAdmin ? 'admin' : 'user'
        },
        // user_metadata mirrors role for UI display only — never read for authz.
        user_metadata: {
          ...targetUser.user.user_metadata,
          role: makeAdmin ? 'admin' : 'user'
        }
      });

      await logAuditEvent(supabase, {
        actorEmail: user.email || 'admin',
        action: makeAdmin ? 'User promoted to admin' : 'Admin demoted to user',
        category: 'admin',
        targetId: targetUserId,
        targetEmail: targetUser.user.email,
        details: `Changed role from "${oldRole}" to "${makeAdmin ? 'admin' : 'user'}" for ${targetUser.user.email}`,
        severity: 'info',
      });
      return json(res, 200, { success: true });
    }

    case 'utility':
      return await handleAdminUtility(req, res, supabase, user);

    case 'test':
      return await handleAdminTest(req, res, supabase);

    case 'health':
      return await handleAdminHealth(req, res, supabase);

    case 'query':
      return await handleAdminQuery(req, res, supabase);

    case 'revenue':
      return await handleAdminRevenue(req, res);

    case 'bulk':
      return await handleAdminBulk(req, res, supabase, user);

    case 'audit':
      return await handleAdminAudit(req, res, supabase, user);

    default:
      return json(res, 400, { error: 'Invalid admin action' });
  }
}

async function handleAdminUtility(req: VercelRequest, res: VercelResponse, supabase: any, requestingUser: any) {
  const { action } = req.body || {};

  switch (action) {
    case 'set_role': {
      const parsed = validateBody(res, AdminSetRoleSchema, req.body);
      if (!parsed.ok) return;
      const { targetUserId, testData } = parsed.data;
      const role = testData?.role;
      const { data: userData } = await supabase.auth.admin.getUserById(targetUserId);
      if (!userData?.user) return json(res, 404, { error: 'User not found' });
      if (userData.user.email === ADMIN_EMAIL) return json(res, 403, { error: 'Cannot change owner' });

      const oldRole = userData.user.app_metadata?.role || 'user';
      await supabase.auth.admin.updateUserById(targetUserId, {
        // app_metadata is the authorization source of truth (service-role only).
        app_metadata: {
          ...userData.user.app_metadata,
          role: role || 'user'
        },
        // user_metadata mirrors role for UI display only — never read for authz.
        user_metadata: {
          ...userData.user.user_metadata,
          role: role || 'user'
        }
      });

      await logAuditEvent(supabase, {
        actorEmail: requestingUser.email || 'admin',
        action: 'User role updated',
        category: 'admin',
        targetId: targetUserId,
        targetEmail: userData.user.email,
        details: `Changed role from "${oldRole}" to "${role || 'user'}" for ${userData.user.email}`,
        severity: 'info',
      });
      return json(res, 200, { success: true, role: role || 'user' });
    }

    case 'set_subscription': {
      const parsed = validateBody(res, AdminSetSubscriptionSchema, req.body);
      if (!parsed.ok) return;
      const { targetUserId, testData } = parsed.data;
      const { status, plan } = testData || {};
      const { data: userData } = await supabase.auth.admin.getUserById(targetUserId);
      if (!userData?.user) return json(res, 404, { error: 'User not found' });

      await supabase.auth.admin.updateUserById(targetUserId, {
        // Authoritative copy — service-role only.
        app_metadata: { subscription_status: status || 'active' },
        user_metadata: {
          ...userData.user.user_metadata,
          subscription_status: status || 'active',
          plan: plan || 'Pro'
        }
      });

      await logAuditEvent(supabase, {
        actorEmail: requestingUser.email || 'admin',
        action: 'Subscription updated',
        category: 'subscription',
        targetId: targetUserId,
        targetEmail: userData.user.email,
        details: `Set subscription to status="${status || 'active'}", plan="${plan || 'Pro'}" for ${userData.user.email}`,
        severity: 'info',
      });
      return json(res, 200, { success: true });
    }

    case 'create_test_user': {
      const parsed = validateBody(res, CreateTestUserSchema, req.body);
      if (!parsed.ok) return;
      const { email, password, makeAdmin = false, role = 'user' } = parsed.data.testData;

      const userPayload = {
        email,
        password,
        email_confirm: true,
        // app_metadata is the authorization source of truth (service-role only).
        app_metadata: {
          role: role || 'user',
        },
        user_metadata: {
          full_name: email.split('@')[0],
          role: role || 'user',
          plan: 'Starter',
          subscription_status: 'none',
          joined_date: Date.now().toString()
        }
      };

      let { data, error } = await supabase.auth.admin.createUser(userPayload);

      // If user already exists from a previous scan, delete and retry once
      if (error && (error.message?.includes('already') || error.status === 422)) {
        try {
          const { data: existingUsers } = await supabase.auth.admin.listUsers();
          const existing = existingUsers?.users?.find((u: any) => u.email === email);
          if (existing) await supabase.auth.admin.deleteUser(existing.id);
        } catch { /* best effort */ }
        const retry = await supabase.auth.admin.createUser(userPayload);
        data = retry.data;
        error = retry.error;
      }

      if (error) throw error;

      await logAuditEvent(supabase, {
        actorEmail: requestingUser.email || 'admin',
        action: 'Test user created',
        category: 'user',
        targetId: data.user.id,
        targetEmail: email,
        details: `Created test user ${email} with role "${role}"${makeAdmin ? ' (admin)' : ''}`,
        severity: 'info',
      });
      return json(res, 200, { success: true, user: { id: data.user.id, email: data.user.email, role } });
    }

    case 'get_user_details': {
      const parsed = validateBody(res, z.object({ targetUserId: z.string().uuid() }), req.body);
      if (!parsed.ok) return;
      const { targetUserId } = parsed.data;
      const { data: userData } = await supabase.auth.admin.getUserById(targetUserId);
      if (!userData?.user) return json(res, 404, { error: 'User not found' });
      return json(res, 200, { user: { id: userData.user.id, email: userData.user.email, metadata: userData.user.user_metadata } });
    }

    case 'delete_user': {
      const parsed = validateBody(res, z.object({ targetUserId: z.string().uuid() }), req.body);
      if (!parsed.ok) return;
      const { targetUserId } = parsed.data;
      if (targetUserId === requestingUser.id) return json(res, 403, { error: 'Cannot delete your own account' });
      const { data: userData } = await supabase.auth.admin.getUserById(targetUserId);
      if (!userData?.user) return json(res, 404, { error: 'User not found' });
      if (userData.user.email === ADMIN_EMAIL) return json(res, 403, { error: 'Cannot delete the owner account' });

      const targetEmail = userData.user.email;

      // Clean up user's data in public schema before deleting auth record
      try {
        await supabase.from('cards').delete().eq('user_id', targetUserId);
        await supabase.from('decks').delete().eq('user_id', targetUserId);
        await supabase.from('learning_path_enrollments').delete().eq('user_id', targetUserId);
        await supabase.from('fact_check_history').delete().eq('user_id', targetUserId);
        await supabase.from('chat_logs').delete().eq('user_id', targetUserId);
      } catch (cleanupErr: any) {
        console.warn('Partial cleanup during user deletion:', cleanupErr.message);
      }

      await supabase.auth.admin.deleteUser(targetUserId);

      await logAuditEvent(supabase, {
        actorEmail: requestingUser.email || 'admin',
        action: 'User permanently deleted',
        category: 'user',
        targetId: targetUserId,
        targetEmail: targetEmail,
        details: `Admin "${requestingUser.email}" permanently deleted user "${targetEmail}" and all associated data`,
        severity: 'warning',
      });
      return json(res, 200, { success: true });
    }

    default:
      return json(res, 400, { error: 'Invalid utility action' });
  }
}

// SQL Query endpoint for DatabaseExplorer
async function handleAdminQuery(req: VercelRequest, res: VercelResponse, supabase: any) {
  const parsed = validateBody(res, AdminQuerySchema, req.body);
  if (!parsed.ok) return;
  const { query } = parsed.data;

  // Validate query safety - only allow read operations
  const trimmed = query.trim();
  const upperQuery = trimmed.toUpperCase();
  const isAllowed = ALLOWED_QUERY_PREFIXES.some(prefix => upperQuery.startsWith(prefix));
  if (!isAllowed) {
    return json(res, 403, { error: 'Only SELECT, EXPLAIN, SHOW, DESCRIBE, and WITH queries are allowed' });
  }

  const hasBlocked = BLOCKED_KEYWORDS.some(kw => {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    return regex.test(trimmed);
  });
  if (hasBlocked) {
    return json(res, 403, { error: 'Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are not allowed' });
  }

  try {
    // Use Supabase's rpc to call a database function for raw SQL execution
    const { data, error } = await supabase.rpc('execute_sql', { query_text: trimmed });
    if (error) throw error;
    return json(res, 200, { rows: data || [], columns: data && data.length > 0 ? Object.keys(data[0]) : [] });
  } catch (err: any) {
    console.error('SQL query error:', err.message);
    return json(res, 500, { error: err.message || 'Query execution failed', details: err.hint || '' });
  }
}

// ── Health Check: Stripe payments deep test ──
async function handleAdminHealth(req: VercelRequest, res: VercelResponse, supabase: any) {
  // URL is /api/admin/health/payments → path = 'admin/health/payments', subAction = 'payments'
  const subAction = ((req.query.path as string) || '').split('/')[2];

  if (subAction === 'payments') {
    const results: any = {
      configOk: false,
      apiOk: false,
      prices: [],
      products: [],
      webhookConfigured: false,
      testPaymentIntentCreated: false,
      errors: [] as string[],
    };

    try {
      const Stripe = (await import('stripe')).default;
      const secretKey = process.env.STRIPE_SECRET_KEY || '';
      if (!secretKey) {
        results.errors.push('STRIPE_SECRET_KEY not configured');
        return json(res, 200, results);
      }
      results.configOk = true;

      const stripe = new Stripe(secretKey);

      // Test 1: List prices (basic API connectivity)
      try {
        const prices = await stripe.prices.list({ limit: 10, active: true });
        results.apiOk = true;
        results.prices = prices.data.map(p => ({
          id: p.id,
          nickname: p.nickname || p.id,
          currency: p.currency,
          unitAmount: p.unit_amount ? (p.unit_amount / 100).toFixed(2) : '0.00',
          interval: p.recurring?.interval || 'one-time',
          active: p.active,
        }));
      } catch (err: any) {
        results.errors.push(`Prices list failed: ${err.message}`);
      }

      // Test 2: List products
      try {
        const products = await stripe.products.list({ limit: 10, active: true });
        results.products = products.data.map(p => ({
          id: p.id,
          name: p.name,
          active: p.active,
        }));
      } catch (err: any) {
        results.errors.push(`Products list failed: ${err.message}`);
      }

      // Test 3: Check webhook endpoint exists
      try {
        const webhooks = await stripe.webhookEndpoints.list({ limit: 10 });
        const auramindWebhook = webhooks.data.find(
          (w: any) => w.url?.includes('auramind') || w.url?.includes('stripe-webhook'),
        );
        results.webhookConfigured = !!auramindWebhook;
        if (auramindWebhook) {
          results.webhookUrl = auramindWebhook.url;
          results.webhookEnabled = auramindWebhook.enabled_events?.length > 0;
        }
      } catch (err: any) {
        results.errors.push(`Webhook check failed: ${err.message}`);
      }

      // Test 4: Create a test payment intent (unconfirmed — no charge)
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: 100, // $1.00 — test amount
          currency: 'usd',
          // NOTE: do not pass payment_method_types — dynamic payment methods
          // must stay enabled (stripe-best-practices: omit unless Terminal).
          description: 'AuraMind health check — test payment (not charged)',
          metadata: { source: 'health_check', timestamp: new Date().toISOString() },
        });
        results.testPaymentIntentCreated = paymentIntent.status === 'requires_payment_method';
        results.testPaymentIntentId = paymentIntent.id;
        results.testPaymentIntentStatus = paymentIntent.status;
        results.testPaymentAmount = `1.00 USD`;

        // Immediately cancel the test payment intent to clean up
        await stripe.paymentIntents.cancel(paymentIntent.id).catch(() => {});
      } catch (err: any) {
        results.errors.push(`Test payment intent failed: ${err.message}`);
      }

    } catch (err: any) {
      results.errors.push(`Stripe init failed: ${err.message}`);
    }

    return json(res, 200, results);
  }

  return json(res, 400, { error: 'Invalid health action. Use: payments' });
}

async function handleAdminTest(req: VercelRequest, res: VercelResponse, supabase: any) {
  const results = {
    timestamp: new Date().toISOString(),
    tests: [] as any[]
  };

  // Test Supabase
  try {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    results.tests.push({ name: 'Supabase Connection', status: 'passed', message: `Found ${users.length} users` });
  } catch (err: any) {
    results.tests.push({ name: 'Supabase Connection', status: 'failed', message: err.message });
  }

  // Test Stripe
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
    await stripe.prices.list({ limit: 1 });
    results.tests.push({ name: 'Stripe API', status: 'passed', message: 'Connected' });
  } catch (err: any) {
    results.tests.push({ name: 'Stripe API', status: 'failed', message: err.message });
  }

  // Test Resend Email
  try {
    const resendKey = process.env.RESEND_API_KEY || '';
    const resendFrom = process.env.RESEND_FROM_EMAIL || '';
    if (!resendKey) {
      results.tests.push({ name: 'Resend Email', status: 'failed', message: 'RESEND_API_KEY not configured' });
    } else {
      // Verify the API key works by checking Resend's health endpoint
      const res = await fetch('https://api.resend.com/emails', {
        method: 'GET',
        headers: { Authorization: `Bearer ${resendKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok || res.status === 405) {
        // 200 or 405 (Method Not Allowed) both mean we authenticated successfully
        results.tests.push({ name: 'Resend Email', status: 'passed', message: `Configured (from: ${resendFrom || 'default'})` });
      } else {
        results.tests.push({ name: 'Resend Email', status: 'failed', message: `API returned ${res.status}` });
      }
    }
  } catch (err: any) {
    results.tests.push({ name: 'Resend Email', status: 'failed', message: err.message });
  }

  return json(res, 200, results);
}

// Coupon endpoints
async function handleCoupons(req: VercelRequest, res: VercelResponse, action?: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  if (!secretKey) {
    return json(res, 500, { error: 'Stripe secret key not configured. Add STRIPE_SECRET_KEY to environment variables.' });
  }
  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secretKey);

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  if (!isAdminUser(user)) return json(res, 403, { error: 'Forbidden' });

  switch (action) {
    case 'list': {
      const coupons = await stripe.coupons.list({ limit: 100 });
      return json(res, 200, { coupons: coupons.data });
    }
    case 'create': {
      const parsed = validateBody(res, CouponCreateSchema, req.body);
      if (!parsed.ok) return;
      const { id, name, percent_off, amount_off, duration, duration_in_months } = parsed.data;
      const coupon = await stripe.coupons.create({
        id: id || undefined,
        name: name || 'Coupon',
        percent_off: percent_off ? parseFloat(String(percent_off)) : undefined,
        amount_off: amount_off ? parseInt(String(amount_off)) * 100 : undefined,
        duration: duration || 'once',
        duration_in_months: duration === 'repeating' ? parseInt(String(duration_in_months)) : undefined,
      });
      return json(res, 200, { coupon });
    }
    case 'delete': {
      const parsed = validateBody(res, CouponDeleteSchema, req.body);
      if (!parsed.ok) return;
      const { couponId } = parsed.data;
      await stripe.coupons.del(couponId);
      return json(res, 200, { success: true });
    }
    default:
      return json(res, 400, { error: 'Invalid coupon action' });
  }
}

// Subscription endpoints

// Dunning grace window: how long a `past_due` user keeps full access while
// Stripe smart-retries their card. After it elapses the entitlement is
// treated as expired (the cron downgrades the metadata itself).
const DUNNING_GRACE_DAYS = Number(process.env.DUNNING_GRACE_DAYS || 7);

export function isPastDueExpired(metadata: Record<string, unknown>, now = Date.now()): boolean {
  if (metadata.subscription_status !== 'past_due') return false;
  const failedAt = typeof metadata.last_payment_failure_at === 'string'
    ? Date.parse(metadata.last_payment_failure_at)
    : NaN;
  if (Number.isNaN(failedAt)) return true; // past_due with no timestamp — treat as expired
  return now - failedAt > DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000;
}

async function handleSubscription(req: VercelRequest, res: VercelResponse, action?: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  // Auth required: subscription status is entitlement data. Without this gate
  // anyone could enumerate plan/status for arbitrary user UUIDs.
  const caller = await authenticateUser(req, res);
  if (!caller) return;

  const parsed = validateBody(res, SubscriptionVerifySchema, req.body ?? {});
  if (!parsed.ok) return;

  // Self-lookup only — a body userId that disagrees with the token is rejected
  // rather than silently honored (prevents cross-account probing).
  if (parsed.data.userId && parsed.data.userId !== caller.id) {
    return json(res, 403, { error: 'Forbidden' });
  }

  const { data: userData } = await supabase.auth.admin.getUserById(caller.id);
  if (!userData?.user) return json(res, 404, { error: 'User not found' });

  const metadata = userData.user.user_metadata || {};
  // Entitlement comes from app_metadata, which only the service-role key can
  // write. user_metadata is client-writable — reading status from there let
  // any user grant themselves a subscription with a single updateUser call.
  // Display fields (plan, trial_end, failure counts) stay in user_metadata.
  const rawStatus = readSubscriptionStatus(userData.user);

  // Grace-period enforcement: a past_due user keeps access during the dunning
  // window, then reads as expired here even before the cron downgrades them.
  if (isPastDueExpired(metadata)) {
    return json(res, 200, {
      subscribed: false,
      status: 'expired',
      plan: metadata.plan || 'Starter',
      graceEndedAt: metadata.last_payment_failure_at || null,
    });
  }

  return json(res, 200, {
    subscribed: rawStatus === 'active' || rawStatus === 'trialing' || rawStatus === 'past_due',
    status: rawStatus,
    plan: metadata.plan || 'Starter'
  });
}

// Stripe endpoints
async function handleStripe(req: VercelRequest, res: VercelResponse, action?: string) {
  const secretKey = process.env.STRIPE_SECRET_KEY || '';
  if (!secretKey) {
    return json(res, 500, { error: 'Stripe secret key not configured. Add STRIPE_SECRET_KEY to environment variables.' });
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(secretKey);

  switch (action) {
    case 'checkout': {
      // Auth required: the caller's identity always comes from the token.
      // Trusting body userId/email would let anyone mark another account as
      // trialing (this handler writes subscription metadata on success) or
      // attach a victim's email to the Stripe session.
      const caller = await authenticateUser(req, res);
      if (!caller) return;

      const parsed = validateBody(res, StripeCheckoutSchema, req.body);
      if (!parsed.ok) return;
      const { priceId } = parsed.data;
      const userId = caller.id;
      const email = caller.email || '';

      // Mode guard — never mix a live key with test prices (or vice versa). A
      // live key cannot even retrieve a test price, so a mismatch would
      // otherwise surface as a confusing 500 mid-checkout. Fail loudly with
      // the exact fix instead of breaking real payers silently.
      const isLiveKey = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_');
      let price;
      try {
        price = await stripe.prices.retrieve(priceId);
      } catch {
        return json(res, 400, {
          error:
            `Checkout price check failed: cannot retrieve price "${priceId}" with this STRIPE_SECRET_KEY. ` +
            `This almost always means the client price ID and the API key are in different Stripe modes ` +
            `(e.g. a test price with a live key). See STRIPE_LAUNCH_CHECKLIST.md.`,
        });
      }
      if (price.livemode !== isLiveKey) {
        return json(res, 400, {
          error:
            `Stripe mode mismatch: price "${priceId}" is ${price.livemode ? 'live' : 'test'} but ` +
            `STRIPE_SECRET_KEY is ${isLiveKey ? 'live' : 'test'}. Align them before launching checkout. ` +
            `See STRIPE_LAUNCH_CHECKLIST.md.`,
        });
      }

      try {
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          payment_method_collection: 'always',
          // Launch/win-back codes have to be enabled at session-creation time —
          // it cannot be applied to sessions that already exist.
          allow_promotion_codes: true,
          line_items: [{ price: priceId, quantity: 1 }],
          subscription_data: {
            trial_period_days: 7,
            metadata: { supabase_user_id: userId }
          },
          customer_email: email,
          metadata: { supabase_user_id: userId },
          success_url: `${req.headers.origin || 'https://auramind.app'}/dashboard?payment=success`,
          cancel_url: `${req.headers.origin || 'https://auramind.app'}/subscribe?payment=cancelled`
        });

        // Immediately mark user as trialing so they don't get stuck in a redirect loop
        // (the webhook is async and may not have fired by the time they return from Stripe)
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
          if (supabaseUrl && supabaseServiceKey) {
            const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
            if (userData?.user) {
              await supabaseAdmin.auth.admin.updateUserById(userId, {
                // Authoritative copy — service-role only.
                app_metadata: { subscription_status: 'trialing' },
                user_metadata: {
                  ...userData.user.user_metadata,
                  subscription_status: 'trialing',
                  plan: 'Pro',
                },
              });
            }
          }
        } catch (metaErr: any) {
          console.warn('Failed to update user metadata after checkout:', metaErr.message);
          // Non-fatal — the webhook will eventually update it
        }

        return json(res, 200, { url: session.url });
      } catch (err: any) {
        console.error('Stripe checkout error:', err.message);
        return json(res, 500, { error: err.message || 'Failed to create checkout session' });
      }
    }
    case 'portal': {
      // Auth required + customer ownership check: without this, anyone could
      // mint a billing-portal session for an arbitrary Stripe customer id and
      // take over their billing management.
      const caller = await authenticateUser(req, res);
      if (!caller) return;

      const parsed = validateBody(res, StripePortalSchema, req.body);
      if (!parsed.ok) return;
      const { customerId } = parsed.data;

      // Ownership: the requested customer must match the Stripe customer id
      // recorded on the caller's auth metadata (written by the webhook), or a
      // Stripe customer whose email matches the caller.
      const metadataCustomerId =
        typeof caller.user_metadata?.stripe_customer_id === 'string'
          ? (caller.user_metadata.stripe_customer_id as string)
          : undefined;
      if (customerId !== metadataCustomerId) {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          if (customer.deleted || !('email' in customer) || customer.email?.toLowerCase() !== caller.email?.toLowerCase()) {
            return json(res, 403, { error: 'Forbidden' });
          }
        } catch {
          return json(res, 403, { error: 'Forbidden' });
        }
      }

      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${req.headers.origin || 'https://auramind.app'}/settings`
        });
        return json(res, 200, { url: session.url });
      } catch (err: any) {
        console.error('Stripe portal error:', err.message);
        return json(res, 500, { error: err.message || 'Failed to create billing portal session' });
      }
    }
    default:
      return json(res, 400, { error: 'Invalid stripe action' });
  }
}

// Integration endpoints
async function handleIntegrations(req: VercelRequest, res: VercelResponse, action?: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  switch (action) {
    case 'notion/connect': {
      const { accessToken, workspaceId, workspaceName } = req.body || {};
      if (!accessToken) return json(res, 400, { error: 'Missing accessToken' });

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...user.user_metadata,
          integrations: {
            ...user.user_metadata.integrations,
            notion: {
              connected: true,
              accessToken,
              workspaceId,
              workspaceName,
              connectedAt: Date.now()
            }
          }
        }
      });
      return json(res, 200, { success: true });
    }

    case 'notion/disconnect': {
      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};
      delete integrations.notion;

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          integrations
        }
      });
      return json(res, 200, { success: true });
    }

    case 'anki/update': {
      const { importCount } = req.body || {};
      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          integrations: {
            ...integrations,
            anki: {
              connected: true,
              lastImportAt: Date.now(),
              importCount: (integrations.anki?.importCount || 0) + (importCount || 0)
            }
          }
        }
      });
      return json(res, 200, { success: true });
    }

    case 'obsidian/connect': {
      const { vaultPaths } = req.body || {};
      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          integrations: {
            ...integrations,
            obsidian: {
              connected: true,
              vaultPaths,
              lastImportAt: Date.now()
            }
          }
        }
      });
      return json(res, 200, { success: true });
    }

    case 'obsidian/disconnect': {
      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};
      delete integrations.obsidian;

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          integrations
        }
      });
      return json(res, 200, { success: true });
    }

    case 'schoology/connect': {
      const { consumerKey, accessToken } = req.body || {};
      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          integrations: {
            ...integrations,
            schoology: {
              connected: true,
              consumerKey,
              accessToken,
              connectedAt: Date.now()
            }
          }
        }
      });
      return json(res, 200, { success: true });
    }

    case 'schoology/disconnect': {
      const metadata = user.user_metadata || {};
      const integrations = metadata.integrations || {};
      delete integrations.schoology;

      await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...metadata,
          integrations
        }
      });
      return json(res, 200, { success: true });
    }

    default:
      return json(res, 400, { error: 'Invalid integration action' });
  }
}

// Account endpoints
async function handleAccount(req: VercelRequest, res: VercelResponse, action?: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  switch (action) {
    case 'delete': {
      // Capture why the user left before their record is gone, so we can
      // learn from churn. Destructure defensively: a missing/malformed body
      // must not block the deletion itself.
      const { reason = '', feedback = '' } = (req.body || {}) as {
        reason?: string;
        feedback?: string;
      };

      // Persist the reason for the maintainer (post-launch, this could feed
      // a support ticker or a churn report). Best-effort — never block the
      // user's own deletion on a logging failure.
      try {
        const reasonText = [reason, feedback].filter(Boolean).join(' — ').slice(0, 2000);
        if (reasonText) {
          await logAuditEvent(supabase, {
            actorEmail: user.email || 'unknown',
            action: 'Account deleted (user-initiated)',
            category: 'user',
            details: reasonText,
            severity: 'info',
          });
        }
      } catch (err) {
        console.warn('[account/delete] failed to log deletion reason:', err.message);
      }

      // Clean up public-schema data first (decks, cards, etc.) then the auth
      // record, mirroring the admin delete path.
      try {
        const cleanups = ['cards', 'decks', 'study_sessions', 'chat_logs', 'card_reviews'];
        for (const table of cleanups) {
          // The delete builder is PromiseLike (no .catch); rely on the outer try/catch.
          await supabase.from(table).delete().eq('user_id', user.id);
        }
      } catch { /* best-effort cleanup */ }

      await supabase.auth.admin.deleteUser(user.id);
      return json(res, 200, { success: true });
    }
    default:
      return json(res, 400, { error: 'Invalid account action' });
  }
}

// Email endpoints — transactional mail is sent server-side so the Resend
// API key never ships in the client bundle. Callers must be authenticated
// and can only send to their own address (prevents relay abuse).
// Web search proxy — the Google Custom Search API key lives server-side
// only. Clients call POST /api/search with their session token; the key
// never ships in the browser bundle.
async function handleSearch(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const searchKey = process.env.GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!searchKey || !engineId) {
    return json(res, 503, { error: 'Web search is not configured on the server' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  const validated = validateBody(res, SearchRequestSchema, req.body);
  if (!validated.ok) return;

  const { query, maxResults, safeSearch } = validated.data;

  try {
    const params = new URLSearchParams({
      key: searchKey,
      cx: engineId,
      q: query,
      num: String(Math.min(maxResults, 10)),
    });
    if (safeSearch) params.set('safe', 'active');

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return json(res, 502, {
        error: `Google Custom Search API error (${response.status})`,
        details: detail.slice(0, 200),
      });
    }

    const jsonBody = await response.json();
    const results = (jsonBody.items ?? []).map((item: any) => {
      let source = item.displayLink || 'unknown';
      if (!source || source === 'unknown') {
        try { source = new URL(item.link || 'https://example.com').hostname; } catch { /* keep unknown */ }
      }
      return {
        title: item.title || 'Untitled',
        url: item.link || '#',
        snippet: item.snippet || '',
        source: source.replace(/^www\./, ''),
        relevanceScore: item.score ?? 0.5,
      };
    });

    return json(res, 200, { results });
  } catch (err: any) {
    console.error('Web search error:', err);
    return json(res, 502, { error: err.message || 'Web search failed' });
  }
}

async function handleEmail(req: VercelRequest, res: VercelResponse, action?: string) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  const validated = validateBody(res, EmailRequestSchema, req.body);
  if (!validated.ok) return;

  if (validated.data.to.toLowerCase() !== (user.email || '').toLowerCase()) {
    return json(res, 403, { error: 'Emails can only be sent to your own address' });
  }

  const result = await sendEmailViaResend(
    validated.data.type,
    validated.data.to,
    validated.data,
    validated.data.origin
  );

  if (!result.success) {
    return json(res, 502, { error: result.error || 'Email send failed' });
  }
  return json(res, 200, { success: true });
}

// --- Audit Log Helper ---

async function logAuditEvent(supabase: any, event: {
  actorEmail: string;
  action: string;
  category: 'user' | 'subscription' | 'admin' | 'database' | 'system' | 'security';
  targetId?: string;
  targetEmail?: string;
  details?: string;
  severity?: 'info' | 'warning' | 'critical';
}) {
  try {
    await supabase.from('audit_events').insert({
      actor_email: event.actorEmail,
      action: event.action,
      category: event.category,
      target_id: event.targetId || null,
      target_email: event.targetEmail || null,
      details: event.details || null,
      severity: event.severity || 'info',
      created_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Failed to log audit event:', err.message);
  }
}

// --- Audit Endpoints ---

// Shared audit list query logic
async function handleAuditList(req: VercelRequest, res: VercelResponse, supabase: any) {
  const parsed = validateBody(res, AuditListSchema, req.body || {});
  if (!parsed.ok) return;
  const { limit, offset, category, severity } = parsed.data;

  let query = supabase.from('audit_events').select('*', { count: 'exact' });
  if (category) query = query.eq('category', category);
  if (severity) query = query.eq('severity', severity);
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  const events = (data || []).map((e: any) => ({
    id: e.id,
    action: e.action,
    category: e.category,
    actor: e.actor_email?.split('@')[0] || 'Unknown',
    actorEmail: e.actor_email,
    target: e.target_id,
    targetEmail: e.target_email,
    details: e.details,
    severity: e.severity,
    timestamp: new Date(e.created_at).getTime(),
  }));

  // Also fetch unfiltered per-category counts for the badge pills
  let categoryCounts: Record<string, number> = {};
  try {
    const { data: catData } = await supabase
      .from('audit_events')
      .select('category')
      .limit(10000);
    if (catData) {
      catData.forEach((e: any) => {
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      });
    }
  } catch { /* ignore count errors */ }

  return json(res, 200, { events, total: count || 0, categoryCounts });
}

// Admin audit sub-endpoint (delegates to shared logic)
async function handleAdminAudit(req: VercelRequest, res: VercelResponse, supabase: any, _user: any) {
  // Delegate to the standalone audit handler's list logic
  const { action } = req.body || {};
  if (action === 'list') {
    return await handleAuditList(req, res, supabase);
  }
  return json(res, 400, { error: 'Invalid audit action. Use: list' });
}

// Standalone audit endpoint (public read + create for admins)
async function handleAudit(req: VercelRequest, res: VercelResponse, action?: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  if (!isAdminUser(user)) return json(res, 403, { error: 'Forbidden' });

  switch (action) {
    case 'list': {
      return await handleAuditList(req, res, supabase);
    }

    case 'create': {
      const parsed = validateBody(res, AuditCreateSchema, req.body);
      if (!parsed.ok) return;
      const event = parsed.data;

      await logAuditEvent(supabase, event as { actorEmail: string; action: string; category: 'user' | 'admin' | 'subscription' | 'database' | 'system' | 'security'; targetId?: string; targetEmail?: string; details?: string; severity?: 'info' | 'warning' | 'critical' });
      return json(res, 200, { success: true });
    }

    default:
      return json(res, 400, { error: 'Invalid audit action' });
  }
}

// --- Stripe Revenue/Metrics Endpoint ---

async function handleAdminRevenue(req: VercelRequest, res: VercelResponse) {
  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

    // Fetch active subscriptions (limit 1000 for scale)
    const activeSubscriptions = await stripe.subscriptions.list({
      status: 'active',
      limit: 1000,
    });

    const trialingSubscriptions = await stripe.subscriptions.list({
      status: 'trialing',
      limit: 100,
    });

    // Calculate MRR from active subscriptions
    let mrr = 0;
    const planCounts: Record<string, number> = {};
    const currencyBreakdown: Record<string, number> = {};

    activeSubscriptions.data.forEach((sub: any) => {
      const items = sub.items?.data || [];
      items.forEach((item: any) => {
        const unitAmount = item.price?.unit_amount || 0;
        const quantity = item.quantity || 1;
        const interval = item.price?.recurring?.interval;
        const planName = item.price?.nickname || item.price?.id || 'Unknown';

        // Normalize to monthly
        let monthlyAmount = 0;
        if (interval === 'month') monthlyAmount = (unitAmount / 100) * quantity;
        else if (interval === 'year') monthlyAmount = ((unitAmount / 100) * quantity) / 12;
        else if (interval === 'week') monthlyAmount = ((unitAmount / 100) * quantity) * 4.33;

        mrr += monthlyAmount;
        planCounts[planName] = (planCounts[planName] || 0) + 1;

        const currency = item.price?.currency || 'usd';
        currencyBreakdown[currency] = (currencyBreakdown[currency] || 0) + monthlyAmount;
      });
    });

    mrr = Math.round(mrr);

    // Fetch revenue from recent successful charges (last 30 days)
    const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
    const recentCharges = await stripe.charges.list({
      limit: 100,
      created: { gte: thirtyDaysAgo },
    });

    const recentRevenue = recentCharges.data
      .filter((c: any) => c.paid)
      .reduce((sum: number, c: any) => sum + c.amount, 0);

    return json(res, 200, {
      mrr,
      arr: mrr * 12,
      activeSubscriptions: activeSubscriptions.data.length,
      trialingSubscriptions: trialingSubscriptions.data.length,
      totalCustomers: String(activeSubscriptions.data.length),
      planBreakdown: planCounts,
      currencyBreakdown,
      recentRevenue: Math.round(recentRevenue / 100),
      revenuePeriod: '30d',
    });
  } catch (err: any) {
    console.error('Revenue fetch error:', err);
    // Return partial data on failure instead of 500
    return json(res, 200, {
      mrr: 0,
      arr: 0,
      activeSubscriptions: 0,
      trialingSubscriptions: 0,
      totalCustomers: '0',
      planBreakdown: {},
      currencyBreakdown: {},
      recentRevenue: 0,
      revenuePeriod: '30d',
      error: err.message,
    });
  }
}

// --- Bulk Admin Operations ---

async function handleAdminBulk(req: VercelRequest, res: VercelResponse, supabase: any, user: any) {
  const { action } = req.body || {};

  switch (action) {
    case 'role': {
      const parsed = validateBody(res, BulkRoleChangeSchema, req.body);
      if (!parsed.ok) return;
      const { userIds, role } = parsed.data;

      const results: { success: string[]; failed: { id: string; error: string }[] } = { success: [], failed: [] };

      for (const uid of userIds) {
        try {
          const { data: userData } = await supabase.auth.admin.getUserById(uid);
          if (!userData?.user) {
            results.failed.push({ id: uid, error: 'User not found' });
            continue;
          }
          if (userData.user.email === ADMIN_EMAIL) {
            results.failed.push({ id: uid, error: 'Cannot change owner' });
            continue;
          }
          await supabase.auth.admin.updateUserById(uid, {
            // app_metadata is the authorization source of truth (service-role only).
            app_metadata: {
              ...userData.user.app_metadata,
              role,
            },
            // user_metadata mirrors role for UI display only — never read for authz.
            user_metadata: {
              ...userData.user.user_metadata,
              role,
            },
          });
          results.success.push(uid);
          await logAuditEvent(supabase, {
            actorEmail: user.email || 'admin',
            action: `Bulk role change: set to ${role}`,
            category: 'admin',
            targetId: uid,
            targetEmail: userData.user.email,
            details: `Changed role to "${role}" as part of bulk operation (${userIds.length} users)`,
          });
        } catch (err: any) {
          results.failed.push({ id: uid, error: err.message });
        }
      }

      return json(res, 200, { success: true, results });
    }

    case 'email': {
      const parsed = validateBody(res, BulkEmailSchema, req.body);
      if (!parsed.ok) return;
      const { userIds, subject, body } = parsed.data;

      // Per-recipient loop (not Resend batch): the 100-recipient schema cap
      // keeps this cheap, and the loop gives exact per-address accounting.
      const failed: { email: string; error: string }[] = [];
      let sent = 0;
      for (const uid of userIds) {
        const { data: userData } = await supabase.auth.admin.getUserById(uid);
        const email = userData?.user?.email;
        if (!email) {
          failed.push({ email: uid, error: 'No email on account' });
          continue;
        }
        const result = await sendCustomEmail(email, subject, body);
        if (result.success) {
          sent += 1;
        } else {
          failed.push({ email, error: result.error || 'Send failed' });
        }
      }

      await logAuditEvent(supabase, {
        actorEmail: user.email || 'admin',
        action: `Bulk email: "${subject}"`,
        category: 'system',
        details: `Bulk email sent to ${sent} of ${userIds.length} users. Subject: "${subject}". Failures: ${failed.length}`,
      });

      return json(res, 200, { success: true, sent, failed });
    }

    case 'export': {
      const parsed = validateBody(res, ExportCSVSchema, req.body);
      if (!parsed.ok) return;
      const { columns, format: fmt } = parsed.data;

      const { data: { users: allUsers } } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      const defaultColumns = ['id', 'email', 'name', 'role', 'plan', 'joined', 'lastSignIn'];
      const selectedColumns = columns?.length ? columns : defaultColumns;

      let output: string;
      if (fmt === 'csv') {
        const header = selectedColumns.join(',');
        const rows = allUsers.map((u: any) =>
          selectedColumns.map((col: string) => {
            switch (col) {
              case 'id': return `"${u.id}"`;
              case 'email': return `"${u.email}"`;
              case 'name': return `"${u.user_metadata?.full_name || u.email?.split('@')[0]}"`;
              case 'role': return `"${u.user_metadata?.role || 'user'}"`;
              case 'plan': return `"${u.user_metadata?.plan || 'Starter'}"`;
              case 'joined': return `"${u.created_at}"`;
              case 'lastSignIn': return `"${u.last_sign_in_at || ''}"`;
              default: return '""';
            }
          }).join(',')
        ).join('\n');
        output = `${header}\n${rows}`;
      } else {
        const jsonUsers = allUsers.map((u: any) => {
          const obj: Record<string, any> = {};
          selectedColumns.forEach((col: string) => {
            switch (col) {
              case 'id': obj.id = u.id; break;
              case 'email': obj.email = u.email; break;
              case 'name': obj.name = u.user_metadata?.full_name || u.email?.split('@')[0]; break;
              case 'role': obj.role = u.user_metadata?.role || 'user'; break;
              case 'plan': obj.plan = u.user_metadata?.plan || 'Starter'; break;
              case 'joined': obj.joined = u.created_at; break;
              case 'lastSignIn': obj.lastSignIn = u.last_sign_in_at || null; break;
              default: obj[col] = null;
            }
          });
          return obj;
        });
        output = JSON.stringify(jsonUsers, null, 2);
      }

      await logAuditEvent(supabase, {
        actorEmail: user.email || 'admin',
        action: `Exported ${allUsers.length} users as ${fmt.toUpperCase()}`,
        category: 'admin',
        details: `Exported ${allUsers.length} users in ${fmt.toUpperCase()} format with columns: ${selectedColumns.join(', ')}`,
      });

      return json(res, 200, {
        success: true,
        format: fmt,
        filename: `auramind-users-export-${new Date().toISOString().slice(0, 10)}.${fmt}`,
        data: output,
        count: allUsers.length,
      });
    }

    default:
      return json(res, 400, { error: 'Invalid bulk action. Use: role, email, or export' });
  }
}

// --- Scheduled maintenance (Vercel Cron) -------------------------------------
//
// GET /api/cron/dunning — invoked daily by the Vercel cron configured in
// vercel.json. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically
// when CRON_SECRET is set on the project; manual calls must present the same
// bearer. Jobs:
//   1. Dunning escalation — past_due users past the grace window lose access
//      (downgraded + cancellation email).
//   2. Trial reminders — trialing users get a nudge 3 days and 1 day before
//      their trial ends (each sent at most once, guarded by metadata flags).
//   3. Ledger pruning — webhook idempotency entries older than 90 days.

async function* paginateUsers(supabase: any) {
  const perPage = 500;
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    for (const u of users) yield u;
    if (users.length < perPage) return;
    page++;
    if (page > 40) return; // hard cap: 20k users per run — plenty for now
  }
}

async function handleCron(req: VercelRequest, res: VercelResponse, action?: string) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (action !== 'dunning') return json(res, 404, { error: 'Unknown cron job' });

  const secret = process.env.CRON_SECRET || '';
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!secret || provided !== secret) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return json(res, 500, { error: 'Server configuration error' });
  }

  const now = Date.now();
  const graceMs = DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000;
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const oneDayMs = 24 * 60 * 60 * 1000;

  const summary = {
    scanned: 0,
    dunningExpired: 0,
    dunningErrors: 0,
    trialReminders3d: 0,
    trialReminders1d: 0,
    emailErrors: 0,
  };

  try {
    for await (const user of paginateUsers(supabase)) {
      summary.scanned++;
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const email = user.email || '';
      const name = (meta.full_name as string) || email.split('@')[0] || 'there';

      // --- Job 1: dunning escalation ---
      if (meta.subscription_status === 'past_due') {
        const failedAt = typeof meta.last_payment_failure_at === 'string' ? Date.parse(meta.last_payment_failure_at) : NaN;
        if (Number.isNaN(failedAt) || now - failedAt > graceMs) {
          try {
            await supabase.auth.admin.updateUserById(user.id, {
              app_metadata: { subscription_status: 'expired' },
              user_metadata: { ...meta, subscription_status: 'expired', plan: 'Starter' },
            });
            summary.dunningExpired++;
            if (email) {
              const sent = await sendEmailViaResend('subscriptionCancelled', email, {
                name,
                plan: 'Pro',
                effectiveDate: new Date().toLocaleDateString(),
              });
              if (!sent.success) summary.emailErrors++;
            }
          } catch {
            summary.dunningErrors++;
          }
        }
        continue;
      }

      // --- Job 2: trial reminders ---
      if (meta.subscription_status === 'trialing' && email) {
        const trialEnd = typeof meta.trial_end === 'string' ? Date.parse(meta.trial_end) : NaN;
        if (!Number.isNaN(trialEnd) && trialEnd > now) {
          const remaining = trialEnd - now;
          if (remaining <= oneDayMs && !meta.trial_final_reminder_sent) {
            const sent = await sendEmailViaResend('trialEnding', email, {
              name,
              daysRemaining: 1,
              trialEnds: new Date(trialEnd).toLocaleDateString(),
            });
            if (sent.success) {
              summary.trialReminders1d++;
              await supabase.auth.admin.updateUserById(user.id, {
                user_metadata: { ...meta, trial_final_reminder_sent: true },
              }).catch(() => {});
            } else {
              summary.emailErrors++;
            }
          } else if (remaining <= threeDaysMs && !meta.trial_reminder_sent) {
            const sent = await sendEmailViaResend('trialEnding', email, {
              name,
              daysRemaining: 3,
              trialEnds: new Date(trialEnd).toLocaleDateString(),
            });
            if (sent.success) {
              summary.trialReminders3d++;
              await supabase.auth.admin.updateUserById(user.id, {
                user_metadata: { ...meta, trial_reminder_sent: true },
              }).catch(() => {});
            } else {
              summary.emailErrors++;
            }
          }
        }
      }
    }

    // --- Job 3: prune the webhook idempotency ledger ---
    let pruned = false;
    try {
      await supabase.rpc('prune_processed_webhook_events');
      pruned = true;
    } catch {
      // Migration may not be applied yet — non-fatal.
    }

    return json(res, 200, { ok: true, ...summary, ledgerPruned: pruned });
  } catch (err: any) {
    console.error('Cron dunning failed:', err);
    return json(res, 500, { error: isProdLike() ? 'Cron job failed' : (err.message || 'Cron job failed') });
  }
}

function isProdLike(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
}

// --- URL extraction endpoints (used by GeneratorPage) ---

/**
 * SSRF guard for user-supplied URLs. Only public http(s) origins may be
 * fetched server-side: block non-http(s) schemes, credentials in the URL,
 * localhost/*.local hostnames, and IP-literal hosts in private, link-local,
 * loopback, or otherwise reserved ranges. After DNS resolution the resolved
 * addresses are re-checked so hostnames that resolve to internal space
 * (e.g. via DNS rebinding or /etc/hosts tricks) are rejected too.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local (cloud metadata: 169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0) || // protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast + reserved
  );
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  return (
    addr === '::' ||
    addr === '::1' ||
    addr.startsWith('fe8') ||
    addr.startsWith('fe9') ||
    addr.startsWith('fea') ||
    addr.startsWith('feb') || // link-local
    addr.startsWith('fc') ||
    addr.startsWith('fd') || // unique local
    addr.startsWith('ff') || // multicast
    addr.startsWith('::ffff:') && isPrivateIPv4(addr.slice(7))
  );
}

async function assertPublicHttpUrl(rawUrl: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only http and https URLs are supported' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === 'metadata'
  ) {
    return { ok: false, reason: 'Internal hosts are not allowed' };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isPrivateIPv4(host)) {
    return { ok: false, reason: 'Private IP addresses are not allowed' };
  }
  if (host.includes(':') && isPrivateIPv6(host)) {
    return { ok: false, reason: 'Private IP addresses are not allowed' };
  }

  // Resolve DNS and verify every resolved address is public. Best-effort:
  // if resolution fails the subsequent fetch will surface the error.
  try {
    const dns = await import('dns');
    const lookup = dns.promises.lookup(host, { all: true, verbatim: true });
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('dns-timeout')), 5000));
    const addresses = await Promise.race([lookup, timeout]);
    for (const entry of addresses as { address: string; family: number }[]) {
      if (entry.family === 4 && isPrivateIPv4(entry.address)) {
        return { ok: false, reason: 'Host resolves to a private address' };
      }
      if (entry.family === 6 && isPrivateIPv6(entry.address)) {
        return { ok: false, reason: 'Host resolves to a private address' };
      }
    }
  } catch (err: any) {
    if (err?.message === 'dns-timeout') {
      return { ok: false, reason: 'DNS resolution timed out' };
    }
    // Unknown TLD / resolution failure — let fetch produce the real error.
  }
  return { ok: true, url };
}

// Fetch a URL server-side and extract readable text (SSRF-guarded: public
// http(s) origins only, DNS re-validated before the outbound fetch).
async function handleFetchUrl(req: VercelRequest, res: VercelResponse) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  const parsed = validateBody(res, z.object({ url: z.string().url() }), req.body);
  if (!parsed.ok) return;
  const { url } = parsed.data;

  const guard = await assertPublicHttpUrl(url);
  if (guard.ok === false) {
    return json(res, 400, { error: guard.reason });
  }

  let response: Response;
  try {
    response = await fetch(guard.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraMind/1.0)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
  } catch (err: any) {
    return json(res, 502, { error: err?.message || 'Failed to fetch URL' });
  }

  if (!response.ok) {
    return json(res, 502, { error: `Failed to fetch URL: ${response.status} ${response.statusText}` });
  }

  // Redirects are followed by fetch; make sure the FINAL origin is still
  // public before consuming the body.
  if (response.url && response.url !== guard.url.toString()) {
    const finalGuard = await assertPublicHttpUrl(response.url);
    if (finalGuard.ok === false) {
      return json(res, 400, { error: 'Redirected to a disallowed host' });
    }
  }

  const html = await response.text();

  // Strip HTML tags and scripts
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = withoutStyles
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);

  // Try to extract a title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';

  return json(res, 200, { success: true, data: { title, text, url } });
}

function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function handleFetchYouTubeTranscript(req: VercelRequest, res: VercelResponse) {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  const authHeader = req.headers.authorization;
  if (!authHeader) return json(res, 401, { error: 'Missing authorization' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return json(res, 401, { error: 'Invalid token' });

  const parsed = validateBody(res, z.object({ url: z.string().min(1) }), req.body);
  if (!parsed.ok) return;
  const { url } = parsed.data;

  const videoId = extractYouTubeVideoId(url);
  if (!videoId) {
    return json(res, 400, { error: 'Invalid YouTube URL' });
  }

  // Fetch video page to get the title
  let pageHtml = '';
  try {
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraMind/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    pageHtml = await pageRes.text();
  } catch {
    pageHtml = '';
  }
  const titleMatch = pageHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : '';

  // Try youtube-transcript API (no key needed)
  try {
    const transcriptRes = await fetch(
      `https://youtubetranscript.com/?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!transcriptRes.ok) {
      return json(res, 200, {
        success: true,
        data: { title, text: '', videoId, error: 'Transcript not available for this video' },
      });
    }

    const data = await transcriptRes.json() as { text: string; duration: number }[];
    const fullText = data.map((seg) => seg.text).join(' ').trim();
    const text = fullText.slice(0, 50000);

    return json(res, 200, { success: true, data: { title, text: text || '', videoId } });
  } catch {
    return json(res, 200, {
      success: true,
      data: { title, text: '', videoId, error: 'Transcript not available for this video' },
    });
  }
}
