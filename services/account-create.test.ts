import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: m.rpc }) }));

import { BankDetailsNotSavedError, createAccount } from './account.service';

const bank = {
  requestId: '00000000-0000-4000-8000-000000000001',
  name: 'BPI',
  type: 'bank',
  nature: 'asset',
  currencyCode: 'PHP',
  openingBalance: '0',
  institutionName: 'BPI',
  bankLast4: '1234',
  bankKind: 'savings',
} as Parameters<typeof createAccount>[1];

describe('createAccount', () => {
  it('reports a created account whose bank details failed, not a failed create', async () => {
    m.rpc.mockImplementation(async (name: string) =>
      name === 'create_account_idempotent'
        ? { data: 'acct-1', error: null }
        : { data: null, error: { message: 'timeout' } },
    );
    await expect(createAccount('u', bank)).rejects.toBeInstanceOf(
      BankDetailsNotSavedError,
    );
  });

  it('saves the details under the id the idempotent create returned', async () => {
    m.rpc.mockReset().mockResolvedValueOnce({ data: 'acct-1', error: null });
    m.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(createAccount('u', bank)).resolves.toBe('acct-1');
    expect(m.rpc).toHaveBeenLastCalledWith('upsert_bank_details', {
      p_user_id: 'u',
      p_account_id: 'acct-1',
      p_last4: '1234',
      p_kind: 'savings',
    });
  });
});
