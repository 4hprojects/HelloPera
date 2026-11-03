import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HP-013: a failed admin read must surface as unavailable, never as an empty
 * list or a zero, because "no failed jobs" during an outage is believed.
 */

const m = vi.hoisted(() => ({
  results: {} as Record<string, { data: unknown; error: unknown; count?: number }>,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const result = () => m.results[table] ?? { data: [], error: null, count: 0 };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'in', 'order', 'limit', 'or'])
        chain[k] = () => chain;
      chain.maybeSingle = async () => result();
      chain.then = (resolve: (v: unknown) => unknown) => resolve(result());
      return chain;
    },
  }),
}));

import {
  getUserDetail,
  listAuditLog,
  listFlags,
  listOcrJobs,
  listUsers,
} from './admin.service';

const failed = { data: null, error: { code: '57014' } };

beforeEach(() => {
  m.results = {};
});

describe('admin reads report failure instead of emptiness', () => {
  it.each([
    ['audit log', 'audit_logs', () => listAuditLog({})],
    ['flags', 'feature_flags', () => listFlags()],
    ['ocr jobs', 'ocr_jobs', () => listOcrJobs()],
    ['users', 'profiles', () => listUsers({})],
  ])('%s', async (_label, table, read) => {
    m.results[table] = failed;
    const result = await read();
    expect(result.state).toBe('unavailable');
  });

  it('returns the rows when the read works', async () => {
    m.results.feature_flags = {
      data: [{ key: 'ocr_enabled', enabled: true, config: {}, updated_at: 'now' }],
      error: null,
    };
    const result = await listFlags();
    expect(result.state === 'ok' && result.data.map((f) => f.key)).toEqual([
      'ocr_enabled',
    ]);
  });

  it('does not show a user with zero records when a count failed', async () => {
    m.results.profiles = {
      data: {
        id: 'u',
        email: 'u@example.test',
        role: 'user',
        status: 'active',
        created_at: 'now',
      },
      error: null,
    };
    m.results.transactions = { data: null, error: { code: '57014' }, count: undefined };
    expect((await getUserDetail('u')).state).toBe('unavailable');
  });
});
