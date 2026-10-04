import { describe, expect, it } from 'vitest';
import { groupAccountsByNature, loanProgress } from '@/lib/finance/account-groups';

const acc = (id: string, nature: 'asset' | 'liability', is_archived = false) => ({
  id,
  nature,
  is_archived,
});

describe('groupAccountsByNature', () => {
  it('splits owned from owed and keeps order', () => {
    const { owned, owed } = groupAccountsByNature([
      acc('cash', 'asset'),
      acc('card', 'liability'),
      acc('bank', 'asset'),
    ]);
    expect(owned.map((a) => a.id)).toEqual(['cash', 'bank']);
    expect(owed.map((a) => a.id)).toEqual(['card']);
  });

  it('moves archived accounts to the end of their group', () => {
    const { owned } = groupAccountsByNature([
      acc('old', 'asset', true),
      acc('a', 'asset'),
      acc('b', 'asset'),
    ]);
    expect(owned.map((a) => a.id)).toEqual(['a', 'b', 'old']);
  });

  it('returns empty groups for no accounts', () => {
    expect(groupAccountsByNature([])).toEqual({ owned: [], owed: [] });
  });
});

describe('loanProgress', () => {
  it('is null without a principal', () => {
    expect(loanProgress(500n, undefined)).toBeNull();
    expect(loanProgress(500n, 0n)).toBeNull();
  });

  it('is whole percent paid, clamped to 0..100', () => {
    expect(loanProgress(7500n, 10000n)).toBe(25);
    expect(loanProgress(12000n, 10000n)).toBe(0);
    expect(loanProgress(0n, 10000n)).toBe(100);
  });
});
