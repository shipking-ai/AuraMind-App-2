import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';

/**
 * csvCell through the real export endpoint, covering more vectors than the
 * original admin-export test.
 *
 * The one that needs a quote-aware parser: a quoted CSV field may legally
 * contain a newline (RFC 4180), so a name of "line1\nline2" spans two physical
 * lines while still being one field. Splitting the file on '\n' - which the
 * first version of this test did - reported three bogus failures and looked
 * like a row-alignment bug in the export. It was a bug in the test.
 */
const supabase = vi.hoisted(() => ({
  auth: { getUser: vi.fn(), admin: { listUsers: vi.fn() } },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  supabase.auth.admin.listUsers.mockReset();
});

const ADMIN = { id: 'a', email: 'admin@auramind.app', app_metadata: { role: 'admin' }, user_metadata: {} };
const AUTH = { authorization: 'Bearer t' };

/** Every leading character a spreadsheet treats as the start of a formula. */
const VECTORS: Record<string, string> = {
  equals: '=HYPERLINK("http://evil","click")',
  plus: '+1+1',
  minus: '-2+3',
  at: '@SUM(A1)',
  tab: '\tcmd',
  cr: '\rcmd',
  quote: 'Sam "QA" Lee',
  comma: 'Doe, Jane',
  newline: 'line1\nline2',
  plain: 'Alex Morgan',
};

const KEYS = Object.keys(VECTORS);
const USERS = KEYS.map((k, i) => ({
  id: `u${i}`,
  email: `${k}@x.co`,
  created_at: '2026-09-01T00:00:00Z',
  last_sign_in_at: null,
  app_metadata: {},
  user_metadata: { full_name: VECTORS[k] },
}));

/** Quote-aware RFC 4180 field splitter. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

async function exportCsv() {
  supabase.auth.getUser.mockResolvedValue({ data: { user: ADMIN }, error: null });
  supabase.auth.admin.listUsers.mockResolvedValue({ data: { users: USERS }, error: null });
  const { status, body } = await call('admin/bulk', {
    headers: AUTH,
    body: { action: 'export', format: 'csv', columns: ['id', 'name'] },
  });
  expect(status).toBe(200);
  return parseCsv(body.data);
}

describe('csvCell through the export endpoint', () => {
  it('emits a header and one row per user even with an embedded newline', async () => {
    const rows = await exportCsv();
    expect(rows[0]).toEqual(['id', 'name']);
    expect(rows).toHaveLength(KEYS.length + 1);
  });

  it('neutralises every spreadsheet-formula vector with a leading apostrophe', async () => {
    const rows = await exportCsv();
    for (const key of ['equals', 'plus', 'minus', 'at', 'tab', 'cr']) {
      const cell = rows[KEYS.indexOf(key) + 1][1];
      expect(cell, `${key} should be prefixed with an apostrophe`).toMatch(/^'/);
      expect(cell.slice(1)).toBe(VECTORS[key]);
    }
  });

  it('leaves values that are not formulas untouched', async () => {
    const rows = await exportCsv();
    expect(rows[KEYS.indexOf('plain') + 1][1]).toBe('Alex Morgan');
    expect(rows[KEYS.indexOf('comma') + 1][1]).toBe('Doe, Jane');
    expect(rows[KEYS.indexOf('newline') + 1][1]).toBe('line1\nline2');
  });

  it('round-trips embedded quotes through a real parser', async () => {
    const rows = await exportCsv();
    expect(rows[KEYS.indexOf('quote') + 1][1]).toBe('Sam "QA" Lee');
  });

  it('keeps columns aligned so no field can shift the ones after it', async () => {
    const rows = await exportCsv();
    KEYS.forEach((_, i) => expect(rows[i + 1][0]).toBe(`u${i}`));
  });
});
