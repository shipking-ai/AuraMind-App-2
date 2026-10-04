import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../index.js';
import { makeRes } from './helpers.js';

/**
 * The apps call the API cross-origin (Android: https://localhost, iOS:
 * capacitor://localhost, Windows: https://tauri.localhost). Production had
 * no CORS headers at all, so web views blocked every response. Only the
 * website and the apps are allowed.
 *
 * The web origins are asserted via APP_ORIGIN rather than as literals: the
 * allowlist derives from that constant (see _lib/origin.ts), so hardcoding the
 * domain here would make this suite fail on any environment that has
 * APP_ORIGIN exported — a CI job with the var set, or a developer testing a
 * domain migration locally.
 *
 * The stub has to be installed before ../index.js is first evaluated, because
 * that import graph computes CORS_ORIGINS at module load. `vi.hoisted` runs
 * ahead of the imports for that reason; a plain beforeEach would be too late
 * once the handler had already captured the allowlist.
 */
vi.hoisted(() => {
  process.env.APP_ORIGIN = '';
});

function preflight(origin: string) {
  const headers: Record<string, string> = {};
  const res = makeRes();
  (res as any).setHeader = (k: string, v: string) => {
    headers[k.toLowerCase()] = v;
    return res;
  };
  const req: any = {
    method: 'OPTIONS',
    query: { path: 'ai/speech' },
    headers: { origin, 'x-forwarded-for': '10.9.9.9', 'access-control-request-method': 'POST' },
    socket: { remoteAddress: '10.9.9.9' },
    url: '/api/ai/speech',
  };
  return { run: () => handler(req, res), headers, res };
}

afterEach(() => vi.unstubAllEnvs());

describe('CORS in production', () => {
  it.each([
    'capacitor://localhost',
    'https://localhost',
    'https://tauri.localhost',
    'https://bonamind.app',
    'https://www.bonamind.app',
    // The pre-migration domain, allowlisted while links to it are still in
    // circulation (see LEGACY_APP_ORIGIN).
    'https://auramind.app',
  ])(
    'allows %s',
    async (origin) => {
      vi.stubEnv('VERCEL', '1');
      const { run, headers, res } = preflight(origin);
      await run();
      expect(res.state.status).toBe(204);
      expect(headers['access-control-allow-origin']).toBe(origin);
      expect(headers['access-control-allow-headers']).toContain('Authorization');
    },
  );

  it.each(['https://evil.example', 'http://tauri.localhost', 'https://tauri.localhost.evil.example'])(
    'does not allow %s',
    async (origin) => {
      vi.stubEnv('VERCEL', '1');
      const { run, headers } = preflight(origin);
      await run();
      expect(headers['access-control-allow-origin']).toBeUndefined();
      expect(headers['vary']).toBe('Origin');
    },
  );
});
