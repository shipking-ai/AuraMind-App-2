import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
}));

const resendMock = vi.hoisted(() => ({
  emails: {
    send: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = resendMock.emails;
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  resendMock.emails.send.mockReset();
});

const authedUser = { id: 'u1', email: 'student@example.com' };

describe('POST /api/email', () => {
  it('rejects requests without an auth header', async () => {
    const { status, body } = await call('email', {
      body: { type: 'welcome', to: 'student@example.com' },
    });
    expect(status).toBe(401);
  });

  it('rejects sending to any address other than the caller', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: authedUser }, error: null });

    const { status, body } = await call('email', {
      headers: { authorization: 'Bearer good-token' },
      body: { type: 'welcome', to: 'someone-else@example.com' },
    });

    expect(status).toBe(403);
    expect(body.error).toContain('own address');
    expect(resendMock.emails.send).not.toHaveBeenCalled();
  });

  it('allows sending to the caller’s own address', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    const { status, body } = await call('email', {
      headers: { authorization: 'Bearer good-token' },
      body: {
        type: 'welcome',
        to: 'STUDENT@example.com', // case-insensitive match
        origin: 'https://bonamind.app',
      },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(resendMock.emails.send).toHaveBeenCalled();
  });

  it('propagates a resend failure as 502', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: authedUser }, error: null });
    resendMock.emails.send.mockResolvedValue({ data: null, error: { message: 'rate limited' } });

    const { status, body } = await call('email', {
      headers: { authorization: 'Bearer good-token' },
      body: { type: 'welcome', to: 'student@example.com' },
    });

    expect(status).toBe(502);
    expect(body.error).toContain('rate limited');
  });
});
