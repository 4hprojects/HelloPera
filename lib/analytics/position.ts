import { money, type Money } from '@/lib/money';
import type { AccountNature } from '@/lib/finance/types';

/**
 * Assets, liabilities and net position per currency — PHASE-06 §8, §9, §10.
 *
 * Pure, so §75 criteria 2–4 ("users can view total assets / liabilities / net
 * position") are actually covered by tests. This used to live inside
 * `services/account.service.ts`, which imports `server-only` and therefore
 * could not be reached from a unit test at all.
 */

export type PositionAccount = {
  nature: AccountNature;
  currency: string;
  /** The account's own balance. Liabilities are stored as a positive debt. */
  balance: Money;
  isArchived: boolean;
};

export type PositionSummary = {
  currency: string;
  assets: Money;
  /** §10 — always a positive "amount owed", never a negative asset. */
  liabilities: Money;
  /** assets − liabilities. Negative when debt exceeds what is held. */
  net: Money;
  accountCount: number;
};

/**
 * Totals per currency, never combined — HelloPera does not convert (master
 * plan §11, §8 "Do not convert or combine without FX data").
 *
 * Archived accounts are excluded by default (§9 "active asset accounts",
 * §26, §47). The filter lives here rather than in each caller so there is one
 * place to be wrong about it.
 *
 * `preferred` puts the user's own currency first; the rest follow
 * alphabetically so the order is stable between loads.
 */
export function summarisePositions(
  accounts: readonly PositionAccount[],
  options: { includeArchived?: boolean; preferred?: string } = {},
): PositionSummary[] {
  const byCurrency = new Map<
    string,
    { assets: bigint; liabilities: bigint; n: number }
  >();

  for (const account of accounts) {
    if (account.isArchived && !options.includeArchived) continue;
    const entry = byCurrency.get(account.currency) ?? {
      assets: 0n,
      liabilities: 0n,
      n: 0,
    };
    if (account.nature === 'asset') entry.assets += account.balance.minor;
    else entry.liabilities += account.balance.minor;
    entry.n += 1;
    byCurrency.set(account.currency, entry);
  }

  const { preferred } = options;
  return [...byCurrency.entries()]
    .map(([currency, { assets, liabilities, n }]) => ({
      currency,
      assets: money(assets, currency),
      liabilities: money(liabilities, currency),
      net: money(assets - liabilities, currency),
      accountCount: n,
    }))
    .sort((a, b) => {
      if (a.currency === preferred) return -1;
      if (b.currency === preferred) return 1;
      return a.currency.localeCompare(b.currency);
    });
}

/** The summary for one currency, or a zeroed one so a card never renders nothing. */
export function positionFor(
  summaries: readonly PositionSummary[],
  currency: string,
): PositionSummary {
  return (
    summaries.find((s) => s.currency === currency) ?? {
      currency,
      assets: money(0n, currency),
      liabilities: money(0n, currency),
      net: money(0n, currency),
      accountCount: 0,
    }
  );
}
