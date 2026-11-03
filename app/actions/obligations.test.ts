import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  createRule: vi.fn(),
  generate: vi.fn(),
  audit: vi.fn(),
  createExpectedIncome: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({
    user: { id: 'user-1' },
    profile: { timezone: 'Asia/Manila', default_currency: 'PHP' },
  }),
}));
vi.mock('@/lib/auth/audit', () => ({ recordAuditEvent: m.audit }));
vi.mock('@/lib/ops/kill-switches', () => ({
  assertWritesEnabled: async () => undefined,
  WritesDisabledError: class extends Error {},
}));
vi.mock('@/services/recurring-rule.service', () => ({
  createRule: m.createRule,
  generateOccurrences: m.generate,
}));
vi.mock('@/services/obligation.service', () => ({
  createExpectedIncome: m.createExpectedIncome,
  AllocationError: class extends Error {},
  ObligationEditError: class extends Error {},
}));

import { createExpectedIncomeAction } from './obligations';

const REQUEST = '00000000-0000-4000-8000-0000000000aa';

function income(extra: Record<string, string> = {}): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    requestId: REQUEST,
    sourceName: 'Salary',
    amount: '25000.00',
    currencyCode: 'PHP',
    expectedDate: '2099-11-30',
    ...extra,
  }))
    f.set(k, v);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.createRule.mockResolvedValue({ id: REQUEST, created: true });
  m.createExpectedIncome.mockResolvedValue('income-id');
});

describe('createExpectedIncomeAction', () => {
  it('creates a repeating income under the form request id and audits it', async () => {
    await createExpectedIncomeAction({}, income({ frequency: 'monthly' }));
    expect(m.createRule).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ ruleType: 'expected_income', amount: '25000.00' }),
      expect.any(String),
      { id: REQUEST },
    );
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.redirect).toHaveBeenCalledWith('/expected-income?created=1');
  });

  it('writes no second audit row when the same submission arrives again', async () => {
    m.createRule.mockResolvedValue({ id: REQUEST, created: false });
    await createExpectedIncomeAction({}, income({ frequency: 'monthly' }));
    expect(m.audit).not.toHaveBeenCalled();
    expect(m.generate).toHaveBeenCalled();
  });

  it('creates a one-off income under the request id', async () => {
    await createExpectedIncomeAction({}, income());
    expect(m.createExpectedIncome).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ sourceName: 'Salary' }),
      { id: REQUEST },
    );
  });

  it('falls back to a database id when the request id is malformed', async () => {
    await createExpectedIncomeAction({}, income({ requestId: 'nope' }));
    expect(m.createExpectedIncome).toHaveBeenCalledWith('user-1', expect.anything(), {
      id: undefined,
    });
  });
});
