/**
 * Vercel API Middleware - Security Headers & Rate Limiting
 * 
 * Applied to all API routes to ensure security best practices.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkRateLimit, getClientIp } from './_rateLimit.js';

// Security headers to apply to all responses
const SECURITY_HEADERS = {
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.posthog.com https://vercel.live https://js.puter.com https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://api.groq.com https://api.stripe.com https://api.puter.com https://puter.com https://*.sentry.io https://*.ingest.sentry.io https://huggingface.co https://cdn-lfs.huggingface.co https://wasm.huggingface.co",
    "frame-src 'self' https://js.stripe.com https://challenges.cloudflare.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; '),

  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking
  'X-Frame-Options': 'DENY',

  // Enable XSS protection
  'X-XSS-Protection': '0', // Modern browsers use CSP instead

  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Permissions policy
  'Permissions-Policy': [
    'camera=()',
    'microphone=(self)',
    'geolocation=()',
    'payment=(self)',
    'usb=()',
    'magnetometer=()',
    'gyroscope=()',
    'accelerometer=()',
  ].join(', '),

  // Strict Transport Security (production only)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Cross-Origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Rate limiting configuration
/**
 * Origins allowed to call the API from another origin. The website is
 * same-origin and needs none of this, but the apps are not: the Android app
 * runs at https://localhost and the iOS app at capacitor://localhost, and
 * without these headers their web views block every API response (AI,
 * voices, transcription). Credentials are bearer tokens, never cookies, so
 * echoing an allowlisted origin is safe.
 */
export const CORS_ORIGINS: ReadonlySet<string> = new Set([
  'https://auramind.app',
  'https://www.auramind.app',
  'https://localhost',
  'capacitor://localhost',
]);

const RATE_LIMITS = {
  default: { max: 100, window: 60 * 1000 }, // 100 requests per minute
  ai: { max: 30, window: 60 * 1000 }, // 30 AI requests per minute
  auth: { max: 10, window: 60 * 1000 }, // 10 auth requests per minute
};

/**
 * Apply security headers and rate limiting. Returns true if the request
 * should continue to the handler. Returns false if a response was already
 * sent (OPTIONS preflight or 429 rate limit).
 */
export async function applyMiddleware(
  req: VercelRequest,
  res: VercelResponse,
  options?: { rateLimitType?: 'default' | 'ai' | 'auth' }
): Promise<boolean> {
  // Security headers: vercel.json sets them in production. CORS is set here
  // in both cases — vercel.json has no CORS rule, so production relies on it.
  const isVercel = !!process.env.VERCEL;
  if (!isVercel) {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, value);
    }
    // Standalone dev server: permissive CORS.
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
  } else {
    // Production: only the website and the two apps.
    const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : '';
    res.setHeader('Vary', 'Origin');
    if (CORS_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  // Rate limiting — distributed via Upstash when configured, per-instance
  // in-memory otherwise (see _rateLimit.ts).
  const rateLimitType = options?.rateLimitType || 'default';
  const config = RATE_LIMITS[rateLimitType];
  const clientIp = getClientIp(req);
  const rateLimit = await checkRateLimit(`${rateLimitType}:${clientIp}`, config.max, config.window);

  res.setHeader('X-RateLimit-Limit', config.max);
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
  res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000));

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', Math.ceil((rateLimit.resetAt - Date.now()) / 1000));
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${Math.ceil((rateLimit.resetAt - Date.now()) / 1000)} seconds.`,
      retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
    });
    return false;
  }

  return true;
}


