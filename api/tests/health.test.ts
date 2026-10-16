import { describe, it, expect } from 'vitest';
import { call } from './helpers.js';

describe('GET /api/health', () => {
  it('returns ok status without requiring auth or rate-limit headers', async () => {
    const { status, body } = await call('health', { method: 'GET' });
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('bonamind-api');
    expect(typeof body.timestamp).toBe('number');
  });

  it('rejects non-GET methods', async () => {
    const { status, body } = await call('health', { method: 'POST', body: {} });
    expect(status).toBe(405);
    expect(body.error).toBe('Method not allowed');
  });
});
