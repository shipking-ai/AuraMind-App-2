/**
 * Vitest setup — runs inside each worker before any test file (and therefore
 * before `api/_rateLimit.ts` reads its env) so suite results are hermetic.
 *
 * `vitest` inherits the parent shell environment, and on dev machines that
 * export UPSTASH_* (e.g. sourced from the repo-root .env) the distributed
 * rate limiter silently switches to real network calls before each handler
 * runs. Fetch-mock assertions then see Upstash instead of the provider under
 * test, several suites fail with confusing count mismatches, and CI (which
 * never has those vars) can't reproduce any of it.
 *
 * Deleting the variables (not setting them to `undefined` — Node stringifies
 * that into the literal "undefined", which `Boolean(process.env.X)` treats as
 * configured) forces the in-memory limiter fallback that CI already
 * exercises, so local and CI run the exact same code path.
 */

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Tripwire: no test should ever reach a rate-limiter endpoint. If this fires,
 * a new env var started leaking the limiter config into the test process —
 * fix the leak here rather than weakening fetch-mock assertions.
 */
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (/upstash\.io\/pipeline|\/pipeline/.test(url) && /INCR/.test(String(init?.body ?? ''))) {
    throw new Error(
      `test tried to call the distributed rate limiter (${url}). ` +
        'UPSTASH_* must stay unset in the vitest environment — see tests/setup.ts.',
    );
  }
  return originalFetch(input as Parameters<typeof originalFetch>[0], init);
}) as typeof fetch;
