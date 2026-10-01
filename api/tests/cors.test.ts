import { describe, it, expect, vi, afterEach } from 'vitest';
import handler from '../index.js';
import { makeRes } from './helpers.js';

/**
 * The apps call the API cross-origin (Android: https://localhost, iOS:
 * capacitor://localhost, Windows: https://tauri.localhost). Production had
 * no CORS headers at all, so web views blocked every response. Only the
 * website and the apps are allowed.
 */

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
    'https://auramind.app',
    'https://www.auramind.app',
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
