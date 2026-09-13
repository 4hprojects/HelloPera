import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_REQUIREMENTS,
  analyticsClass,
  balanceEffect,
  type AccountRole,
} from '@/lib/finance/balance';
import {
  TRANSACTION_TYPES,
  type AccountNature,
  type TransactionType,
} from '@/lib/finance/types';

/**
 * Every row of the Phase 02 §34 balance-effect matrix.
 *
 * These are the tests that matter most in HelloPera: a sign flip here is money
 * silently moving the wrong way, and no amount of UI testing would catch it.
 */

type Row = {
  name: string;
  type: TransactionType;
  role: AccountRole;
  nature: AccountNature;
  direction?: 'increase' | 'decrease';
  expect: -1 | 0 | 1;
};

const MATRIX: Row[] = [
  // opening_balance
  {
    name: 'opening balance on an asset adds',
    type: 'opening_balance',
    role: 'destination',
    nature: 'asset',
    expect: 1,
  },
  {
    name: 'opening balance on a liability records debt owed',
    type: 'opening_balance',
    role: 'destination',
    nature: 'liability',
    expect: 1,
  },
  {
    name: 'opening balance can open an asset overdrawn',
    type: 'opening_balance',
    role: 'destination',
    nature: 'asset',
    direction: 'decrease',
    expect: -1,
  },

  // income
  {
    name: 'income into an asset adds',
    type: 'income',
    role: 'destination',
    nature: 'asset',
    expect: 1,
  },
  {
    name: 'income into a liability is inert (rejected at validation)',
    type: 'income',
    role: 'destination',
    nature: 'liability',
    expect: 0,
  },
  {
    name: 'income does not touch a source account',
    type: 'income',
    role: 'source',
    nature: 'asset',
    expect: 0,
  },

  // expense
  {
    name: 'expense from an asset reduces it',
    type: 'expense',
    role: 'source',
    nature: 'asset',
    expect: -1,
  },
  {
    name: 'expense on a credit card increases what is owed',
    type: 'expense',
    role: 'source',
    nature: 'liability',
    expect: 1,
  },
  {
    name: 'expense does not touch a destination account',
    type: 'expense',
    role: 'destination',
    nature: 'asset',
    expect: 0,
  },

  // transfer
  {
    name: 'transfer out of an asset reduces it',
    type: 'transfer',
    role: 'source',
    nature: 'asset',
    expect: -1,
  },
  {
    name: 'transfer into an asset adds',
    type: 'transfer',
    role: 'destination',
    nature: 'asset',
    expect: 1,
  },
  {
    name: 'transfer into a liability repays debt',
    type: 'transfer',
    role: 'destination',
    nature: 'liability',
    expect: -1,
  },
  {
    name: 'transfer out of a liability is a cash advance',
    type: 'transfer',
    role: 'source',
    nature: 'liability',
    expect: 1,
  },

  // refund
  {
    name: 'refund into an asset adds',
    type: 'refund',
    role: 'destination',
    nature: 'asset',
    expect: 1,
  },
  {
    name: 'refund onto a card reduces debt',
    type: 'refund',
    role: 'destination',
    nature: 'liability',
    expect: -1,
  },

  // adjustment
  {
    name: 'adjustment increase on an asset adds',
    type: 'adjustment',
    role: 'source',
    nature: 'asset',
    direction: 'increase',
    expect: 1,
  },
  {
    name: 'adjustment decrease on an asset subtracts',
    type: 'adjustment',
    role: 'source',
    nature: 'asset',
    direction: 'decrease',
    expect: -1,
  },
  {
    name: 'adjustment increase on a liability raises debt',
    type: 'adjustment',
    role: 'source',
    nature: 'liability',
    direction: 'increase',
    expect: 1,
  },
  {
    name: 'adjustment decrease on a liability lowers debt',
    type: 'adjustment',
    role: 'source',
    nature: 'liability',
    direction: 'decrease',
    expect: -1,
  },
];

describe('balanceEffect — the §34 matrix', () => {
  for (const row of MATRIX) {
    it(row.name, () => {
      expect(
        balanceEffect({
          type: row.type,
          role: row.role,
          nature: row.nature,
          direction: row.direction ?? null,
        }),
      ).toBe(row.expect);
    });
  }
});

describe('voiding', () => {
  it('stops every transaction type from affecting any balance', () => {
    for (const type of TRANSACTION_TYPES) {
      for (const role of ['source', 'destination'] as const) {
        for (const nature of ['asset', 'liability'] as const) {
          expect(
            balanceEffect({
              type,
              role,
              nature,
              direction: 'increase',
              status: 'voided',
            }),
          ).toBe(0);
        }
      }
    }
  });
});

describe('the credit-card double-count trap', () => {
  // The single most likely way to produce wrong spending totals: counting the
  // purchase AND the card payment as expenses.
  it('a card purchase raises debt and counts as expense exactly once', () => {
    expect(balanceEffect({ type: 'expense', role: 'source', nature: 'liability' })).toBe(
      1,
    );
    expect(analyticsClass('expense')).toBe('expense');
  });

  it('paying the card from a bank account reduces both and is NOT an expense', () => {
    expect(balanceEffect({ type: 'transfer', role: 'source', nature: 'asset' })).toBe(-1);
    expect(
      balanceEffect({ type: 'transfer', role: 'destination', nature: 'liability' }),
    ).toBe(-1);
    expect(analyticsClass('transfer')).toBe('neutral');
  });

  it('a full purchase-then-pay cycle nets to one expense and zero net worth change', () => {
    const purchase =
      balanceEffect({ type: 'expense', role: 'source', nature: 'liability' }) * 2000;
    const payFromBank =
      balanceEffect({ type: 'transfer', role: 'source', nature: 'asset' }) * 2000;
    const payToCard =
      balanceEffect({ type: 'transfer', role: 'destination', nature: 'liability' }) *
      2000;

    const cardOwed = purchase + payToCard; // +2000 then -2000
    const bank = payFromBank; // -2000

    expect(cardOwed).toBe(0);
    expect(bank).toBe(-2000);
    // Net position = assets - liabilities = -2000 - 0
    expect(bank - cardOwed).toBe(-2000);
  });
});

describe('transfers never count as income or expense', () => {
  it('is neutral in analytics regardless of account natures', () => {
    expect(analyticsClass('transfer')).toBe('neutral');
  });

  it('asset-to-asset transfer leaves net worth unchanged', () => {
    const out =
      balanceEffect({ type: 'transfer', role: 'source', nature: 'asset' }) * 5000;
    const inn =
      balanceEffect({ type: 'transfer', role: 'destination', nature: 'asset' }) * 5000;
    expect(out + inn).toBe(0);
  });
});

describe('analyticsClass', () => {
  it('never treats a refund as income', () => {
    expect(analyticsClass('refund')).toBe('refund');
    expect(analyticsClass('refund')).not.toBe('income');
  });

  it('treats adjustments and opening balances as neutral', () => {
    expect(analyticsClass('adjustment')).toBe('neutral');
    expect(analyticsClass('opening_balance')).toBe('neutral');
  });

  it('excludes voided transactions from every class', () => {
    for (const type of TRANSACTION_TYPES) {
      expect(analyticsClass(type, 'voided')).toBe('neutral');
    }
  });
});

describe('ACCOUNT_REQUIREMENTS', () => {
  it('covers every transaction type', () => {
    for (const type of TRANSACTION_TYPES) {
      expect(ACCOUNT_REQUIREMENTS[type]).toBeDefined();
    }
  });

  it('requires both accounts for a transfer and only one elsewhere', () => {
    expect(ACCOUNT_REQUIREMENTS.transfer).toEqual({
      source: true,
      destination: true,
      direction: false,
    });
    expect(ACCOUNT_REQUIREMENTS.expense.destination).toBe(false);
    expect(ACCOUNT_REQUIREMENTS.income.source).toBe(false);
  });

  it('requires a direction only for adjustments', () => {
    expect(ACCOUNT_REQUIREMENTS.adjustment.direction).toBe(true);
    for (const type of TRANSACTION_TYPES) {
      if (type !== 'adjustment') {
        expect(ACCOUNT_REQUIREMENTS[type].direction).toBe(false);
      }
    }
  });
});
