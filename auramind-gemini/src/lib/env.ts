/**
 * Environment Variable Validation
 * 
 * Validates required and optional environment variables at startup.
 * Fails fast with clear error messages if required variables are missing.
 */

/**
 * Static allowlist of client-visible env vars.
 *
 * WHY THIS EXISTS — this is a security boundary, not a convenience wrapper.
 *
 * Vite replaces `import.meta.env.VITE_FOO` (a static property access) with
 * that one value. But indexing the object dynamically — `import.meta.env[name]`
 * — cannot be statically analysed, so Vite gives up and inlines the ENTIRE
 * env object as a literal. That published every VITE_-prefixed variable to
 * the browser, including provider API keys, whether or not any code read
 * them. A `import.meta.env.DEV` guard does not help: the value is embedded
 * at build time regardless of which branch runs.
 *
 * So every read goes through this map, and every entry below is a static
 * property access. A variable that is not listed here cannot reach the
 * bundle — which is the point.
 *
 * DO NOT add a secret to this map, and DO NOT reintroduce `import.meta.env[x]`
 * dynamic indexing anywhere in src/. `clientSecretExposure.test.ts` enforces
 * both, and a canary build asserts the bundle stays clean.
 */
const CLIENT_ENV: Readonly<Record<string, string | undefined>> = {
  // Public config — safe by design to ship to the browser.
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  VITE_STRIPE_PUBLISHABLE_KEY: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
  VITE_STRIPE_PRICE_ID_MONTHLY: import.meta.env.VITE_STRIPE_PRICE_ID_MONTHLY,
  VITE_STRIPE_PRICE_ID_ANNUAL: import.meta.env.VITE_STRIPE_PRICE_ID_ANNUAL,
  VITE_POSTHOG_KEY: import.meta.env.VITE_POSTHOG_KEY,
  VITE_POSTHOG_HOST: import.meta.env.VITE_POSTHOG_HOST,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
  VITE_OWNER_EMAIL: import.meta.env.VITE_OWNER_EMAIL,

  // Non-secret behaviour flags and model names.
  VITE_AI_MODEL: import.meta.env.VITE_AI_MODEL,
  VITE_GROQ_MODEL: import.meta.env.VITE_GROQ_MODEL,
  VITE_PUTER_MODEL: import.meta.env.VITE_PUTER_MODEL,
  VITE_USE_LOCAL_AI: import.meta.env.VITE_USE_LOCAL_AI,
  VITE_USE_PUTER: import.meta.env.VITE_USE_PUTER,
  VITE_RQ_DEVTOOLS: import.meta.env.VITE_RQ_DEVTOOLS,
  // CI screenshot build only: turns on the /__preview/ios sample-data screens.
  VITE_IOS_PREVIEW: import.meta.env.VITE_IOS_PREVIEW,
  // Cloudflare Turnstile site key. Public by design — it identifies the
  // widget in the browser. The matching SECRET lives only in Supabase.
  VITE_TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY,

  // Deliberately absent, and must stay absent — these are provider
  // credentials that were never safe behind a VITE_ prefix. The client holds
  // no provider key at all; AI goes through /api/ai, which uses the
  // server-side GROQ_API_KEY.
  //
  //   VITE_GROQ_API_KEY, VITE_GEMINI_API_KEY,
  //   VITE_SCHOOLOGY_CONSUMER_KEY, VITE_SCHOOLOGY_CONSUMER_SECRET
  //
  // A `import.meta.env.DEV ? ... : ''` guard was tried here first and did NOT
  // work — the literal still reached the bundle. Omission is the only
  // reliable control, so keep these out of the map.
};

/** Read one allowlisted client env var. Unlisted names return undefined. */
export function readClientEnv(name: string): string | undefined {
  return CLIENT_ENV[name];
}

interface EnvVarConfig {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
  validate?: (value: string) => boolean;
}

const ENV_CONFIG: EnvVarConfig[] = [
  {
    name: 'VITE_SUPABASE_URL',
    required: true,
    description: 'Supabase project URL',
    validate: (v) => v.startsWith('https://'),
  },
  {
    name: 'VITE_SUPABASE_ANON_KEY',
    required: true,
    description: 'Supabase anonymous key',
    validate: (v) => v.length > 20,
  },
  {
    name: 'VITE_USE_PUTER',
    required: false,
    description: 'Puter.js toggle for the user-pays fallback AI provider (default true)',
    defaultValue: 'true',
  },
  {
    name: 'VITE_STRIPE_PUBLISHABLE_KEY',
    required: false,
    description: 'Stripe publishable key (optional, for payments)',
  },
  {
    name: 'VITE_POSTHOG_KEY',
    required: false,
    description: 'PostHog analytics key (optional)',
  },
];

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  missingRequired: string[];
}

/**
 * Validate environment variables
 * Returns validation result with errors and warnings
 */
export function validateEnv(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingRequired: string[] = [];

  for (const config of ENV_CONFIG) {
    const value = readClientEnv(config.name);

    if (!value) {
      if (config.required) {
        errors.push(`Missing required: ${config.name} - ${config.description}`);
        missingRequired.push(config.name);
      } else {
        warnings.push(`Optional: ${config.name} not set - ${config.description}`);
      }
      continue;
    }

    // Check for placeholder values
    if (value.includes('your_') || value.includes('PLACEHOLDER') || value === 'xxx') {
      if (config.required) {
        errors.push(`Placeholder value for: ${config.name} - Replace with actual ${config.description.toLowerCase()}`);
        missingRequired.push(config.name);
      } else {
        warnings.push(`Placeholder value for: ${config.name} - Replace with actual ${config.description.toLowerCase()}`);
      }
      continue;
    }

    // Run custom validation
    if (config.validate && !config.validate(value)) {
      errors.push(`Invalid value: ${config.name} - ${config.description}`);
      missingRequired.push(config.name);
    }
  }

  // Check for AI provider configuration
  // The client holds no Groq key (see CLIENT_ENV), so this is always false.
  // Reading import.meta.env.VITE_GROQ_API_KEY directly here would inline the
  // key into the bundle even though nothing uses the value.
  const hasGroq = hasValidGroqKey();
  const hasLocalAI = import.meta.env.VITE_USE_LOCAL_AI === 'true';
  const puterEnabled = (import.meta.env.VITE_USE_PUTER ?? 'true') !== 'false';

  // Puter.js being enabled counts as "an AI provider configured" for the
  // purposes of the boot-time warning because it lets the user sign in
  // themselves. Don't trigger a "no AI provider configured" warning
  // when Puter is available, even if no Groq key is set.
  if (!hasGroq && !hasLocalAI && !puterEnabled) {
    warnings.push('No AI provider configured - AI features will use demo mode');
  } else if (!hasGroq && !hasLocalAI && puterEnabled) {
    warnings.push('No developer AI key set; users can sign in with Puter for free AI in-browser.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    missingRequired,
  };
}

/**
 * Log validation results to console
 */
export function logEnvValidation(result: EnvValidationResult): void {
  if (result.valid && result.warnings.length === 0) {
    console.warn('[AuraMind] Environment validation passed');
    return;
  }

  if (result.errors.length > 0) {
    console.error('[AuraMind] Environment validation FAILED:');
    result.errors.forEach((err) => console.error(`  - ${err}`));
  }

  if (result.warnings.length > 0) {
    console.warn('[AuraMind] Environment warnings:');
    result.warnings.forEach((warn) => console.warn(`  - ${warn}`));
  }
}

/**
 * Get a typed environment variable with fallback
 */
export function getEnvVar(name: string, defaultValue?: string): string {
  const value = readClientEnv(name);
  if (!value && defaultValue !== undefined) {
    return defaultValue;
  }
  // Previously `import.meta.env[name]` was typed `any`, so an unset var
  // returned undefined through a `: string` signature. Normalise to ''.
  return value ?? '';
}

/**
 * Get a boolean environment variable
 */
export function getEnvBool(name: string, defaultValue = false): boolean {
  const value = readClientEnv(name);
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1' || value === 'yes';
}

/**
 * Get a number environment variable
 */
export function getEnvNumber(name: string, defaultValue?: number): number | undefined {
  const value = readClientEnv(name);
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}

/**
 * hasValidGroqKey — whether a *client-held* Groq key is available.
 *
 * Always false. The client no longer holds a provider key: `VITE_GROQ_API_KEY`
 * is not in CLIENT_ENV, because Vite inlines VITE_ vars into the public bundle
 * and a shipped key is a spendable credential handed to every visitor. AI runs
 * through /api/ai using the server-side GROQ_API_KEY instead.
 *
 * Kept as a named function so the free-AI router keeps one obvious place to
 * ask the question, and so callers keep falling back to Puter / offline
 * exactly as they did before.
 */
export function hasValidGroqKey(): boolean {
  return false;
}



