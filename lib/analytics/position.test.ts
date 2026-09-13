import { describe, expect, it } from 'vitest';
import { positionFor, summarisePositions, type PositionAccount } from './position';
import { money } from '@/lib/money';

const PHP = 'PHP';
const php = (n: bigint) => money(n, PHP);

function acct(over: Partial<PositionAccount> = {}): PositionAccount {
  return {
    nature: 'asset',
    currency: PHP,
    balance: php(10_000_00n),
    isArchived: false,
    ...over,
  };
}

describe('summarisePositions — §8, §9, §10', () => {
  it('totals assets and liabilities and nets them', () => {
    const [m] = summarisePositions([
      acct({ balance: php(84_000_00n) }),
      acct({ balance: php(9_800_00n) }),
      acct({ nature: 'liability', balance: php(48_000_00n) }),
    ]);
    expect(m!.assets.minor).toBe(93_800_00n);
    expect(m!.liabilities.minor).toBe(48_000_00n);
    expect(m!.net.minor).toBe(45_800_00n);
    expect(m!.accountCount).toBe(3);
  });

  it('reports liabilities as a positive amount owed — §10', () => {
    const [m] = summarisePositions([
      acct({ nature: 'liability', balance: php(48_000_00n) }),
    ]);
    // Never a negative asset: the figure is what is owed.
    expect(m!.liabilities.minor).toBe(48_000_00n);
    expect(m!.liabilities.minor > 0n).toBe(true);
  });

  it('goes negative when debt exceeds what is held', () => {
    const [m] = summarisePositions([
      acct({ balance: php(5_000_00n) }),
      acct({ nature: 'liability', balance: php(20_000_00n) }),
    ]);
    expect(m!.net.minor).toBe(-15_000_00n);
  });

  it('handles an overdrawn asset account', () => {
    const [m] = summarisePositions([acct({ balance: php(-1_200_00n) })]);
    expect(m!.assets.minor).toBe(-1_200_00n);
    expect(m!.net.minor).toBe(-1_200_00n);
  });

  it('excludes archived accounts by default — §9, §26, §47', () => {
    const accounts = [
      acct({ balance: php(10_000_00n) }),
      acct({ balance: php(99_000_00n), isArchived: true }),
    ];
    expect(summarisePositions(accounts)[0]!.assets.minor).toBe(10_000_00n);
    expect(summarisePositions(accounts, { includeArchived: true })[0]!.assets.minor).toBe(
      109_000_00n,
    );
  });

  it('never combines currencies — §8', () => {
    const out = summarisePositions(
      [
        acct({ balance: php(84_000_00n) }),
        acct({ currency: 'USD', balance: money(1_500_00n, 'USD') }),
        acct({ currency: 'USD', nature: 'liability', balance: money(400_00n, 'USD') }),
      ],
      { preferred: PHP },
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.currency).toBe(PHP);
    expect(out[0]!.assets.minor).toBe(84_000_00n);
    expect(out[1]!.currency).toBe('USD');
    expect(out[1]!.net.minor).toBe(1_100_00n);
  });

  it('puts the preferred currency first and orders the rest stably', () => {
    const out = summarisePositions(
      [
        acct({ currency: 'USD', balance: money(1n, 'USD') }),
        acct({ currency: 'AUD', balance: money(1n, 'AUD') }),
        acct({ balance: php(1n) }),
      ],
      { preferred: PHP },
    );
    expect(out.map((s) => s.currency)).toEqual([PHP, 'AUD', 'USD']);
  });

  it('returns nothing for no accounts', () => {
    expect(summarisePositions([])).toEqual([]);
  });

  it('drops a currency whose only account is archived', () => {
    const out = summarisePositions([
      acct({ balance: php(1n) }),
      acct({ currency: 'USD', balance: money(9n, 'USD'), isArchived: true }),
    ]);
    expect(out.map((s) => s.currency)).toEqual([PHP]);
  });
});

describe('positionFor', () => {
  it('returns a zeroed summary rather than undefined', () => {
    const p = positionFor([], 'USD');
    expect(p.assets).toEqual({ minor: 0n, currency: 'USD' });
    expect(p.net).toEqual({ minor: 0n, currency: 'USD' });
    expect(p.accountCount).toBe(0);
  });

  it('finds the requested currency when present', () => {
    const out = summarisePositions([acct({ balance: php(7n) })]);
    expect(positionFor(out, PHP).assets.minor).toBe(7n);
  });
});
