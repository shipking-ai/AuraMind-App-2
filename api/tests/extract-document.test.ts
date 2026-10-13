import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { call } from './helpers.js';

/**
 * PDF -> text for course creation on the phone. Extraction spends server
 * compute on an upload, so it is entitled like the AI endpoints.
 */

const supabase = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const user = (status: string) => ({
  data: { user: { id: 'u1', email: 'u@b.co', app_metadata: { subscription_status: status }, user_metadata: {} } },
  error: null,
});
const asPro = () => supabase.auth.getUser.mockResolvedValue(user('active'));
const asFree = () => supabase.auth.getUser.mockResolvedValue(user('none'));
const authed = (body: unknown) => ({ headers: { authorization: 'Bearer token' }, body });
const fixture = readFileSync(new URL('./fixtures/two-pages.pdf', import.meta.url));
const pdfBody = () => ({ name: 'Cell biology.pdf', data: fixture.toString('base64') });

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
});

describe('POST /api/extract/document', () => {
  it('401 without a token', async () => {
    expect((await call('extract/document', { body: pdfBody() })).status).toBe(401);
  });

  it('402 for a free user', async () => {
    asFree();
    const r = await call('extract/document', authed(pdfBody()));
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('subscription_required');
  });

  it('413 over 3 MB', async () => {
    asPro();
    const big = Buffer.alloc(3 * 1024 * 1024 + 1, 0x25).toString('base64');
    const r = await call('extract/document', authed({ name: 'a.pdf', data: big }));
    expect(r.status).toBe(413);
    expect(r.body.code).toBe('too_large');
  });

  it('415 for a file that is not a PDF', async () => {
    asPro();
    const r = await call('extract/document', authed({ name: 'a.pdf', data: Buffer.from('hello world').toString('base64') }));
    expect(r.status).toBe(415);
    expect(r.body.code).toBe('not_pdf');
  });

  it('400 for a malformed body', async () => {
    asPro();
    expect((await call('extract/document', authed({ name: 'a.pdf' }))).status).toBe(400);
  });

  it('reads the text, page count and title of a PDF', async () => {
    asPro();
    const r = await call('extract/document', authed(pdfBody()));
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.pages).toBe(2);
    expect(r.body.data.title).toBe('Cell biology');
    expect(r.body.data.text).toMatch(/Mitochondria make ATP\./);
    expect(r.body.data.text).toMatch(/Ribosomes build proteins\./);
  });
});
