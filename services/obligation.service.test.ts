import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  inserted: [] as Record<string, unknown>[],
  insertResult: { data: null as unknown, error: null as unknown },
  existing: null as unknown,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => {
  const lookup = {
    select: () => lookup,
    eq: () => lookup,
    maybeSingle: async () => ({ data: m.existing, error: null }),
  };
  return {
    createAdminClient: () => ({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          m.inserted.push(row);
          return { select: () => ({ single: async () => m.insertResult }) };
        },
        select: lookup.select,
      }),
    }),
  };
});

import { createBill } from './obligation.service';

const bill = {
  providerName: 'Meralco',
  description: '',
  amount: '10.00',
  currencyCode: 'PHP',
  dueDate: '2026-11-20',
  categoryId: null,
  notes: '',
} as Parameters<typeof createBill>[1];

beforeEach(() => {
  m.inserted.length = 0;
  m.insertResult = { data: { id: 'new-id' }, error: null };
  m.existing = null;
});

describe('createBill', () => {
  it('lets the database choose the id when none is given', async () => {
    expect(await createBill('u', bill)).toBe('new-id');
    expect(m.inserted[0]).not.toHaveProperty('id');
    expect(m.inserted[0]).toMatchObject({ user_id: 'u', amount: '10.00' });
  });

  it('returns the existing row when the same id arrives twice', async () => {
    m.insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    m.existing = { id: 'draft-id' };
    expect(await createBill('u', bill, { id: 'draft-id' })).toBe('draft-id');
    expect(m.inserted[0]).toMatchObject({ id: 'draft-id' });
  });

  it('fails when the conflicting id is not this user’s row', async () => {
    m.insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    await expect(createBill('u', bill, { id: 'draft-id' })).rejects.toThrow(
      'duplicate key',
    );
  });

  it('does not treat other failures as a replay', async () => {
    m.insertResult = { data: null, error: { code: '23514', message: 'check failed' } };
    m.existing = { id: 'draft-id' };
    await expect(createBill('u', bill, { id: 'draft-id' })).rejects.toThrow(
      'check failed',
    );
  });
});
