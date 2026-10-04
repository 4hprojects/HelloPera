import type { AccountNature } from '@/lib/finance/types';

/**
 * Splits accounts into money you own and money you owe.
 *
 * Order within each group is preserved (the list is already oldest-first), with
 * archived accounts moved to the end so they never sit between live ones.
 */
export function groupAccountsByNature<
  T extends { nature: AccountNature; is_archived: boolean },
>(accounts: readonly T[]): { owned: T[]; owed: T[] } {
  const live = (a: T) => !a.is_archived;
  const ordered = [...accounts.filter(live), ...accounts.filter((a) => !live(a))];
  return {
    owned: ordered.filter((a) => a.nature === 'asset'),
    owed: ordered.filter((a) => a.nature === 'liability'),
  };
}

/** Whole-percent paid off, from exact minor units. Null when there is no principal. */
export function loanProgress(owed: bigint, principal: bigint | undefined): number | null {
  if (!principal || principal <= 0n) return null;
  const paid = principal - owed;
  if (paid <= 0n) return 0;
  if (paid >= principal) return 100;
  return Number((paid * 100n) / principal);
}
