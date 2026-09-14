import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';

/**
 * Admin bulk email actually sends via Resend (per-recipient loop with exact
 * accounting). Regression cover for the era when the endpoint collected
 * addresses, wrote "Bulk email sent" to the audit log, returned {sent: N} —
 * and never sent anything.
 */

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: {
      getUserById: vi.fn(),
    },
  },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
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
  supabase.auth.admin.getUserById.mockReset();
  resendMock.emails.send.mockReset();
});

const ADMIN = {
  id: 'admin-1',
  email: 'admin@auramind.app',
  app_metadata: { role: 'admin' },
  user_metadata: {},
};

const AUTH = { authorization: 'Bearer admin-token' };
const UID_A = '00000000-0000-4000-8000-0000000000a1';
const UID_B = '00000000-0000-4000-8000-0000000000b2';

function asAdmin() {
  supabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN }, error: null });
}

function usersById(map: Record<string, { email?: string }>) {
  supabase.auth.admin.getUserById.mockImplementation(async (uid: string) => ({
    data: map[uid] ? { user: { id: uid, email: map[uid].email } } : { user: null },
    error: null,
  }));
}

const payload = {
  action: 'email',
  userIds: [UID_A, UID_B],
  subject: 'Downtime Sunday',
  body: 'Hi all,\n\nMaintenance on Sunday.\nThanks!',
};

describe('POST /api/admin/bulk action=email', () => {
  it('sends to every resolved address and reports sent/failed', async () => {
    asAdmin();
    usersById({ [UID_A]: { email: 'a@x.co' }, [UID_B]: { email: 'b@x.co' } });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'e1' }, error: null });

    const { status, body } = await call('admin/bulk', { headers: AUTH, body: payload });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sent).toBe(2);
    expect(body.failed).toEqual([]);
    expect(resendMock.emails.send).toHaveBeenCalledTimes(2);
    // Admin-composed body ships as escaped text inside the brand shell.
    const firstSend = resendMock.emails.send.mock.calls[0][0];
    expect(firstSend.to).toBe('a@x.co');
    expect(firstSend.subject).toBe('Downtime Sunday');
    expect(firstSend.html).toContain('Maintenance on Sunday');
    expect(firstSend.html).not.toContain('Hi all,\n\nMaintenance');
  });

  it('accounts partial failure per recipient and still 200s', async () => {
    asAdmin();
    usersById({ [UID_A]: { email: 'a@x.co' }, [UID_B]: { email: 'b@x.co' } });
    resendMock.emails.send
      .mockResolvedValueOnce({ data: { id: 'e1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } });

    const { status, body } = await call('admin/bulk', { headers: AUTH, body: payload });

    expect(status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.failed).toEqual([{ email: 'b@x.co', error: 'rate limited' }]);
  });

  it('records accounts without an email as failures, not sends', async () => {
    asAdmin();
    usersById({ [UID_A]: { email: 'a@x.co' }, [UID_B]: {} });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'e1' }, error: null });

    const { status, body } = await call('admin/bulk', { headers: AUTH, body: payload });

    expect(status).toBe(200);
    expect(body.sent).toBe(1);
    expect(body.failed).toEqual([{ email: UID_B, error: 'No email on account' }]);
    expect(resendMock.emails.send).toHaveBeenCalledTimes(1);
  });

  it('escapes markup in the admin-composed body', async () => {
    asAdmin();
    usersById({ [UID_A]: { email: 'a@x.co' }, [UID_B]: { email: 'b@x.co' } });
    resendMock.emails.send.mockResolvedValue({ data: { id: 'e1' }, error: null });

    await call('admin/bulk', {
      headers: AUTH,
      body: { ...payload, userIds: [UID_A], body: '<script>alert(1)</script>' },
    });

    const firstSend = resendMock.emails.send.mock.calls[0][0];
    expect(firstSend.html).toContain('&lt;script&gt;');
    expect(firstSend.html).not.toContain('<script>alert(1)</script>');
  });
});
