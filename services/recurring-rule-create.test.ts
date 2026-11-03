import { beforeEach, describe, expect, it, vi } from 'vitest';

/** HP-037 / HP-033: a rule created under a request id is created once. */

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

import { createRule } from './recurring-rule.service';

const salary = {
  ruleType: 'expected_income',
  name: 'Salary',
  sourceName: 'Salary',
  description: '',
  amount: '25000.00',
  currencyCode: 'PHP',
  frequency: 'monthly',
  intervalCount: 1,
  startDate: '2099-11-30',
  endDate: '',
  categoryId: null,
} as unknown as Parameters<typeof createRule>[1];

beforeEach(() => {
  m.inserted.length = 0;
  m.insertResult = { data: { id: 'rule-1' }, error: null };
  m.existing = null;
});

describe('createRule', () => {
  it('stores the amount as an exact string and reports a new rule', async () => {
    await expect(createRule('u', salary, '2099-11-01', { id: 'req' })).resolves.toEqual({
      id: 'rule-1',
      created: true,
    });
    expect(m.inserted[0]).toMatchObject({
      id: 'req',
      user_id: 'u',
      amount: '25000.00',
      next_occurrence_date: '2099-11-30',
    });
  });

  it('returns the first rule, not created, when the same id arrives again', async () => {
    m.insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    m.existing = { id: 'req' };
    await expect(createRule('u', salary, '2099-11-01', { id: 'req' })).resolves.toEqual({
      id: 'req',
      created: false,
    });
  });

  it('fails when the id belongs to someone else', async () => {
    m.insertResult = { data: null, error: { code: '23505', message: 'duplicate key' } };
    await expect(createRule('u', salary, '2099-11-01', { id: 'req' })).rejects.toThrow(
      /Could not create this rule/,
    );
  });
});
