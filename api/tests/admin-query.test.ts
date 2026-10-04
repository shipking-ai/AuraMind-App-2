import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  rpc: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  supabase.rpc.mockReset();
});

const adminUser = {
  id: 'admin-1',
  email: 'owner@bonamind.app',
  user_metadata: { is_admin: true }, // display only — authz reads app_metadata
  app_metadata: { role: 'admin' },
};

const authedAdmin = { headers: { authorization: 'Bearer admin-token' } };

describe('POST /api/admin/query (execute_sql guard)', () => {
  it('allows a plain SELECT and returns rows', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: adminUser }, error: null });
    supabase.rpc.mockResolvedValue({ data: [{ id: 1 }], error: null });

    const { status, body } = await call('admin/query', {
      ...authedAdmin,
      body: { query: 'SELECT * FROM cards LIMIT 10' },
    });

    expect(status).toBe(200);
    expect(body.rows).toEqual([{ id: 1 }]);
    expect(supabase.rpc).toHaveBeenCalledWith('execute_sql', { query_text: 'SELECT * FROM cards LIMIT 10' });
  });

  it('rejects write statements that are not at the start (EXPLAIN ANALYZE bypass)', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: adminUser }, error: null });

    const { status, body } = await call('admin/query', {
      ...authedAdmin,
      body: { query: 'EXPLAIN ANALYZE DELETE FROM cards' },
    });

    expect(status).toBe(403);
    expect(body.error).toContain('Write operations');
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects data-modifying CTEs (WITH ... DELETE ... SELECT)', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: adminUser }, error: null });

    const { status, body } = await call('admin/query', {
      ...authedAdmin,
      body: { query: 'WITH doomed AS (DELETE FROM cards RETURNING *) SELECT * FROM doomed' },
    });

    expect(status).toBe(403);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('rejects non-query prefixes (DROP, INSERT, UPDATE...)', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: adminUser }, error: null });

    for (const q of ['DROP TABLE cards', 'INSERT INTO cards VALUES (1)', 'UPDATE cards SET x = 1']) {
      const { status } = await call('admin/query', { ...authedAdmin, body: { query: q } });
      expect(status).toBe(403);
    }
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('returns 403 for non-admins', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'student@example.com', user_metadata: {} } },
      error: null,
    });

    const { status } = await call('admin/query', {
      headers: { authorization: 'Bearer student-token' },
      body: { query: 'SELECT 1' },
    });
    expect(status).toBe(403);
  });
});
