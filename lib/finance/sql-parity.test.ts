import { describe, expect, it } from 'vitest';
import { balanceEffect, type AccountRole } from '@/lib/finance/balance';
import {
  ACCOUNT_NATURES,
  DIRECTIONS,
  TRANSACTION_TYPES,
  type AccountNature,
  type Direction,
  type TransactionType,
} from '@/lib/finance/types';

/**
 * Parity between the TypeScript balance engine and the SQL one.
 *
 * `recalculate_account_balance()` in
 * supabase/migrations/20260913000200_phase02_financial_core.sql contains a
 * second implementation of the §34 matrix, written separately. Two hand-written
 * copies of the same rules is exactly how a ledger drifts: the app shows one
 * balance, the recalculation repairs it to a different one, and neither is
 * obviously wrong.
 *
 * `sqlEffect` below is a faithful transcription of the SQL CASE expressions.
 * If the migration changes, change this too — the test then proves the two
 * still agree across every combination.
 */
function sqlEffect(
  type: TransactionType,
  role: AccountRole,
  nature: AccountNature,
  direction: Direction | null,
): -1 | 0 | 1 {
  if (role === 'source') {
    // when t.source_account_id = p_account_id then case t.type ...
    switch (type) {
      case 'expense':
        return nature === 'asset' ? -1 : 1;
      case 'transfer':
        return nature === 'asset' ? -1 : 1;
      case 'adjustment':
        return direction === 'decrease' ? -1 : 1;
      default:
        return 0;
    }
  }
  // when t.destination_account_id = p_account_id then case t.type ...
  switch (type) {
    case 'income':
      return nature === 'asset' ? 1 : 0;
    case 'refund':
      return nature === 'asset' ? 1 : -1;
    case 'transfer':
      return nature === 'asset' ? 1 : -1;
    case 'opening_balance':
      return direction === 'decrease' ? -1 : 1;
    default:
      return 0;
  }
}

describe('SQL and TypeScript balance engines agree', () => {
  const roles: AccountRole[] = ['source', 'destination'];
  const directions: Array<Direction | null> = [...DIRECTIONS, null];

  it('produce identical results for every (type, role, nature, direction)', () => {
    const mismatches: string[] = [];

    for (const type of TRANSACTION_TYPES) {
      for (const role of roles) {
        for (const nature of ACCOUNT_NATURES) {
          for (const direction of directions) {
            const ts = balanceEffect({ type, role, nature, direction });
            const sql = sqlEffect(type, role, nature, direction);
            if (ts !== sql) {
              mismatches.push(
                `${type}/${role}/${nature}/${direction ?? 'null'}: ts=${ts} sql=${sql}`,
              );
            }
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('covers the full combination space', () => {
    const combinations =
      TRANSACTION_TYPES.length *
      roles.length *
      ACCOUNT_NATURES.length *
      directions.length;
    expect(combinations).toBe(6 * 2 * 2 * 3);
  });
});
