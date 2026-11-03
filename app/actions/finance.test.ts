import { beforeEach, describe, expect, it, vi } from 'vitest';

/** HP-037: the finance actions' guards and the paths that decide outcomes. */

const m = vi.hoisted(() => ({
  writes: vi.fn(),
  createAccount: vi.fn(),
  createLoanAccount: vi.fn(),
  getAccount: vi.fn(),
  updateAccountDetails: vi.fn(),
  createTransaction: vi.fn(),
  generate: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({ user: { id: 'user-1' }, profile: {} }),
}));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/ops/kill-switches', () => {
  class WritesDisabledError extends Error {
    constructor() {
      super('HelloPera is temporarily read-only.');
    }
  }
  return { assertWritesEnabled: m.writes, WritesDisabledError };
});
vi.mock('@/services/account.service', () => {
  class AccountEditError extends Error {}
  class BankDetailsNotSavedError extends Error {}
  return {
    archiveAccount: vi.fn(),
    createAccount: m.createAccount,
    createLoanAccount: m.createLoanAccount,
    AccountEditError,
    deleteAccount: vi.fn(),
    getAccount: m.getAccount,
    updateAccountDetails: m.updateAccountDetails,
    BankDetailsNotSavedError,
  };
});
vi.mock('@/services/recurring-rule.service', () => ({ generateOccurrences: m.generate }));
vi.mock('@/services/transaction.service', () => {
  class TransactionError extends Error {}
  return {
    createTransaction: m.createTransaction,
    TransactionError,
    updateTransaction: vi.fn(),
    voidTransaction: vi.fn(),
  };
});

import { WritesDisabledError } from '@/lib/ops/kill-switches';
import { BankDetailsNotSavedError } from '@/services/account.service';
import { TransactionError } from '@/services/transaction.service';
import {
  createAccountAction,
  createTransactionAction,
  updateAccountAction,
} from './finance';

const REQ = '00000000-0000-4000-8000-000000000001';
const ACCT = '00000000-0000-4000-8000-0000000000a1';

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const wallet = { requestId: REQ, name: 'Wallet', type: 'cash', nature: 'asset' };
const loan = {
  requestId: REQ,
  name: 'Car',
  type: 'loan',
  nature: 'liability',
  openingBalance: '5000',
  institutionName: 'BDO',
  paymentAmount: '450',
  paymentFrequency: 'monthly',
  nextDueDate: '2099-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  m.writes.mockResolvedValue(undefined);
  m.createAccount.mockResolvedValue(ACCT);
  m.createLoanAccount.mockResolvedValue(ACCT);
  m.generate.mockResolvedValue(undefined);
  m.getAccount.mockResolvedValue({ id: ACCT, type: 'cash', currency_code: 'PHP' });
});

describe('createAccountAction', () => {
  it('refuses while the ledger is frozen, before reading the form', async () => {
    m.writes.mockRejectedValue(new WritesDisabledError());
    await expect(createAccountAction({}, form(wallet))).resolves.toEqual({
      error: 'HelloPera is temporarily read-only.',
    });
    expect(m.createAccount).not.toHaveBeenCalled();
  });

  it('creates a plain account and does not generate loan bills', async () => {
    await createAccountAction({}, form(wallet));
    expect(m.createAccount).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ requestId: REQ, name: 'Wallet' }),
    );
    expect(m.generate).not.toHaveBeenCalled();
    expect(m.redirect).toHaveBeenCalledWith('/accounts?created=1');
  });

  it('creates a loan and its first bills straight away', async () => {
    await createAccountAction({}, form(loan));
    expect(m.createLoanAccount).toHaveBeenCalled();
    expect(m.generate).toHaveBeenCalledWith('user-1');
  });

  it('still creates a loan when bill generation fails', async () => {
    m.generate.mockRejectedValue(new Error('scheduler busy'));
    await createAccountAction({}, form(loan));
    expect(m.redirect).toHaveBeenCalledWith('/accounts?created=1');
  });

  it('says the account exists when only its bank details failed', async () => {
    m.createAccount.mockRejectedValue(new BankDetailsNotSavedError('x'));
    const state = await createAccountAction(
      {},
      form({ ...wallet, type: 'bank', institutionName: 'BPI', bankLast4: '1234' }),
    );
    expect(state.error).toMatch(/was created, but its bank details were not saved/);
  });
});

describe('createTransactionAction', () => {
  const income = {
    requestId: REQ,
    type: 'income',
    amount: '100',
    transactionDate: '2026-11-03',
    destinationAccountId: ACCT,
    currencyCode: 'USD',
  };

  it("refuses an account that is not the user's, without writing", async () => {
    m.getAccount.mockResolvedValue(null);
    await expect(createTransactionAction({}, form(income))).resolves.toEqual({
      error: 'Choose one of your accounts.',
    });
    expect(m.createTransaction).not.toHaveBeenCalled();
  });

  it('takes the currency from the account, not the form', async () => {
    await createTransactionAction({}, form(income));
    expect(m.createTransaction).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ currencyCode: 'PHP', amount: '100.00' }),
    );
  });

  it("shows the service's message for a refused write", async () => {
    m.createTransaction.mockRejectedValue(
      new TransactionError('That account is archived.'),
    );
    await expect(createTransactionAction({}, form(income))).resolves.toEqual({
      error: 'That account is archived.',
    });
  });
});

describe('updateAccountAction', () => {
  it('reads the account type from the row, not the form', async () => {
    m.getAccount.mockResolvedValue({ id: ACCT, type: 'loan', currency_code: 'PHP' });
    await updateAccountAction(
      {},
      form({
        id: ACCT,
        type: 'cash',
        name: 'Car',
        institutionName: 'BDO',
        paymentAmount: '450',
        paymentFrequency: 'monthly',
        nextDueDate: '2099-01-01',
      }),
    );
    expect(m.updateAccountDetails).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'loan' }),
    );
    expect(m.generate).toHaveBeenCalledWith('user-1');
  });

  it('refuses an account that no longer exists', async () => {
    m.getAccount.mockResolvedValue(null);
    await expect(updateAccountAction({}, form({ id: ACCT, name: 'X' }))).resolves.toEqual(
      {
        error: 'That account no longer exists.',
      },
    );
    expect(m.updateAccountDetails).not.toHaveBeenCalled();
  });
});
