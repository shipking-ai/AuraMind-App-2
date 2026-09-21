import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    // Hermetic defaults: every key a handler might read gets a dummy value so
    // tests never depend on machine configuration. UPSTASH_* (the distributed
    // rate limiter) is deliberately NOT set here — `env` stringifies values,
    // so `undefined` would become the literal "undefined" and make the
    // limiter think it is configured. tests/setup.ts deletes any inherited
    // UPSTASH_* instead; see that file for the full rationale.
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      GOOGLE_SEARCH_API_KEY: 'test-search-key',
      GOOGLE_SEARCH_ENGINE_ID: 'test-engine-id',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy',
      RESEND_API_KEY: 're_test_dummy',
      CRON_SECRET: 'test-cron-secret',
    },
  },
});
