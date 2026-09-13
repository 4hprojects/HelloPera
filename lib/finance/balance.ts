import type {
  AccountNature,
  Direction,
  TransactionStatus,
  TransactionType,
} from '@/lib/finance/types';

/**
 * Balance engine — Phase 02 §34.
 *
 * The single source of truth for which way money moves. Every balance in
 * HelloPera is derived from this table and nothing else.
 *
 * SIGN CONVENTION
 *
 *   Asset      positive = amount owned
 *   Liability  positive = amount owed
 *
 * So `increase` always means "more of what this account represents": more cash
 * in the bank, more debt on the card. Net position is assets minus
 * liabilities, so a rising liability correctly lowers it.
 *
 * `amount` is ALWAYS positive (DB constraint). The sign lives here, never in
 * the stored value — which is what keeps a reversed transfer from silently
 * becoming a deposit.
 */

export type AccountRole = 'source' | 'destination';

export type EffectInput = {
  type: TransactionType;
  /** Required for `adjustment`, optional for `opening_balance`, else ignored. */
  direction?: Direction | null;
  role: AccountRole;
  nature: AccountNature;
  status?: TransactionStatus;
};

/**
 * Multiplier applied to a positive amount for one account's balance.
 * Returns 0 when the transaction does not touch that account in that role.
 */
export function balanceEffect(input: EffectInput): -1 | 0 | 1 {
  const { type, role, nature, direction, status = 'confirmed' } = input;

  // A voided transaction affects nothing. It stays in history and in the audit
  // trail, but it must stop moving money the instant it is voided (§32).
  if (status === 'voided') return 0;

  switch (type) {
    case 'opening_balance':
      // Targets the account via destination. `decrease` covers opening an
      // account that is already overdrawn.
      if (role !== 'destination') return 0;
      return direction === 'decrease' ? -1 : 1;

    case 'income':
      // Income into a liability has no coherent meaning and is rejected at
      // validation (§34a); returning 0 keeps this total rather than throwing.
      if (role !== 'destination' || nature !== 'asset') return 0;
      return 1;

    case 'expense':
      if (role !== 'source') return 0;
      // Paying from an asset reduces it. Charging a card INCREASES what is
      // owed — and that moment is when the expense occurred. The later card
      // payment is a transfer, not a second expense.
      return nature === 'asset' ? -1 : 1;

    case 'transfer':
      if (role === 'source') {
        // asset out = less owned; liability out = borrowing (cash advance).
        return nature === 'asset' ? -1 : 1;
      }
      // asset in = more owned; liability in = debt repaid.
      return nature === 'asset' ? 1 : -1;

    case 'refund':
      if (role !== 'destination') return 0;
      // Money coming back: into an asset it adds, onto a card it reduces debt.
      return nature === 'asset' ? 1 : -1;

    case 'adjustment':
      if (role !== 'source') return 0;
      return direction === 'decrease' ? -1 : 1;

    default: {
      // Exhaustiveness: adding a transaction type without handling it here
      // becomes a compile error rather than a silently zero balance effect.
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

/**
 * How a transaction counts in income/expense analytics — Phase 06 §11–14.
 *
 * Deliberately separate from balance effect. A card payment moves money but is
 * not spending; a refund moves money but is not earning.
 */
export type AnalyticsClass = 'income' | 'expense' | 'refund' | 'neutral';

export function analyticsClass(
  type: TransactionType,
  status: TransactionStatus = 'confirmed',
): AnalyticsClass {
  if (status === 'voided') return 'neutral';
  switch (type) {
    case 'income':
      return 'income';
    case 'expense':
      return 'expense';
    // Netted against expenses, never counted as income: returning a ₱20,000
    // laptop is not ₱20,000 earned.
    case 'refund':
      return 'refund';
    case 'transfer':
    case 'adjustment':
    case 'opening_balance':
      return 'neutral';
    default: {
      const exhaustive: never = type;
      return exhaustive;
    }
  }
}

/** Which account columns a type requires — Phase 02 §34a. */
export const ACCOUNT_REQUIREMENTS: Record<
  TransactionType,
  { source: boolean; destination: boolean; direction: boolean }
> = {
  opening_balance: { source: false, destination: true, direction: false },
  income: { source: false, destination: true, direction: false },
  expense: { source: true, destination: false, direction: false },
  transfer: { source: true, destination: true, direction: false },
  refund: { source: false, destination: true, direction: false },
  adjustment: { source: true, destination: false, direction: true },
};
