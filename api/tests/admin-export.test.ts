import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';

/**
 * Admin user list + export read role and plan from app_metadata only.
 *
 * Both used to read user_metadata, which any signed-in user can write with
 * one auth.updateUser call — so a free account could appear to staff as an
 * admin on the Pro plan. The export also wrote user-chosen names into the CSV
 * unescaped, so a name starting with `=` ran as a spreadsheet formula.
 */

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: {
      listUsers: vi.fn(),
    },
  },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  supabase.auth.admin.listUsers.mockReset();
});

const ADMIN = {
  id: 'admin-1',
  email: 'admin@auramind.app',
  app_metadata: { role: 'admin' },
  user_metadata: {},
};

const AUTH = { authorization: 'Bearer admin-token' };

// Forged: claims admin + Pro in user_metadata, has neither in app_metadata.
const FORGER = {
  id: 'u-forger',
  email: 'forger@x.co',
  created_at: '2026-09-01T00:00:00Z',
  last_sign_in_at: null,
  app_metadata: {},
  user_metadata: { role: 'admin', plan: 'Pro', full_name: '=HYPERLINK("http://evil","x")' },
};

// Real: paying tester, with nothing in user_metadata.
const PAYING_TESTER = {
  id: 'u-tester',
  email: 'tester@x.co',
  created_at: '2026-09-02T00:00:00Z',
  last_sign_in_at: '2026-09-20T00:00:00Z',
  app_metadata: { role: 'tester', subscription_status: 'trialing' },
  user_metadata: { full_name: 'Sam "QA" Lee' },
};

function asAdminWith(users: unknown[]) {
  supabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN }, error: null });
  supabase.auth.admin.listUsers.mockResolvedValue({ data: { users }, error: null });
}

describe('admin user role/plan come from app_metadata', () => {
  it('list ignores forged user_metadata role and plan', async () => {
    asAdminWith([FORGER, PAYING_TESTER]);

    const { status, body } = await call('admin/list', { headers: AUTH, body: {} });

    expect(status).toBe(200);
    const byId = Object.fromEntries(body.users.map((u: any) => [u.id, u]));
    expect(byId['u-forger']).toMatchObject({ role: 'user', plan: 'Starter', isAdmin: false });
    expect(byId['u-tester']).toMatchObject({ role: 'tester', plan: 'Pro' });
  });

  it('json export ignores forged user_metadata role and plan', async () => {
    asAdminWith([FORGER, PAYING_TESTER]);

    const { status, body } = await call('admin/bulk', {
      headers: AUTH,
      body: { action: 'export', format: 'json' },
    });

    expect(status).toBe(200);
    const rows = JSON.parse(body.data);
    expect(rows[0]).toMatchObject({ id: 'u-forger', role: 'user', plan: 'Starter' });
    expect(rows[1]).toMatchObject({ id: 'u-tester', role: 'tester', plan: 'Pro' });
  });

  it('csv export uses app_metadata and escapes user-chosen text', async () => {
    asAdminWith([FORGER, PAYING_TESTER]);

    const { status, body } = await call('admin/bulk', {
      headers: AUTH,
      body: { action: 'export', format: 'csv', columns: ['id', 'name', 'role', 'plan'] },
    });

    expect(status).toBe(200);
    const [header, forgerRow, testerRow] = body.data.split('\n');
    expect(header).toBe('id,name,role,plan');
    // Formula neutralised with a leading quote; embedded quotes doubled.
    expect(forgerRow).toBe('"u-forger","\'=HYPERLINK(""http://evil"",""x"")","user","Starter"');
    expect(testerRow).toBe('"u-tester","Sam ""QA"" Lee","tester","Pro"');
  });
});
