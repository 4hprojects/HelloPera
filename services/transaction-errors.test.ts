import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HP-037: every stable code the transaction RPCs raise reaches the person as
 * a message they can act on, never as the raw database text.
 */

const m = vi.hoisted(() => ({ error: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: async () => ({ data: null, error: m.error }) }),
}));
vi.mock('@/services/plan.service', () => ({ readFlagStrict: vi.fn() }));

import { TransactionError, updateTransaction } from './transaction.service';

const edit = {
  id: '00000000-0000-4000-8000-000000000001',
  amount: '10.00',
  transactionDate: '2026-11-03',
} as Parameters<typeof updateTransaction>[1];

beforeEach(() => {
  m.error = null;
});

describe('transaction error messages', () => {
  it.each([
    ['FINANCIAL_WRITES_DISABLED', /temporarily read-only/],
    ['ACCOUNT_ARCHIVED', /archived/],
    ['TRANSACTION_LINKED', /amount is locked/],
    ['CATEGORY_TYPE_MISMATCH', /income category for income/],
    ['CATEGORY_NOT_FOUND', /category is unavailable/],
    ['TRANSACTION_VOIDED', /voided transaction cannot be edited/],
    ['TRANSACTION_NOT_EDITABLE', /Opening balances cannot be edited/],
    ['AMOUNT_NOT_POSITIVE', /greater than zero/],
    ['something unexpected', /could not save this transaction/],
  ])('%s', async (code, message) => {
    m.error = { message: `ERROR: ${code}` };
    const failure = updateTransaction('u', edit);
    await expect(failure).rejects.toBeInstanceOf(TransactionError);
    await expect(failure).rejects.toThrow(message);
  });
});
