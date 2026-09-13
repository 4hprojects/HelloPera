export const ACCOUNT_TYPES = [
  'cash',
  'bank',
  'gcash',
  'maya',
  'paypal',
  'credit_card',
  'loan',
  'investment',
  'other',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_NATURES = ['asset', 'liability'] as const;
export type AccountNature = (typeof ACCOUNT_NATURES)[number];

export const TRANSACTION_TYPES = [
  'income',
  'expense',
  'transfer',
  'refund',
  'adjustment',
  'opening_balance',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const DIRECTIONS = ['increase', 'decrease'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const TRANSACTION_STATUSES = ['confirmed', 'voided'] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/** Default nature by type. `other` must be chosen explicitly (§9). */
export const DEFAULT_NATURE: Record<Exclude<AccountType, 'other'>, AccountNature> = {
  cash: 'asset',
  bank: 'asset',
  gcash: 'asset',
  maya: 'asset',
  paypal: 'asset',
  investment: 'asset',
  credit_card: 'liability',
  loan: 'liability',
};

/** Liquid accounts — the set Phase 07's cash-flow forecast draws on. */
export const LIQUID_TYPES: readonly AccountType[] = [
  'cash',
  'bank',
  'gcash',
  'maya',
  'paypal',
];
