import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  displayStatus,
  remaining,
  STATUS_LABELS,
  statusTone,
  todayInTimezone,
  type ObligationLike,
} from '@/lib/finance/obligation';
import { money } from '@/lib/money';

const php = (n: bigint) => money(n, 'PHP');

function bill(over: Partial<ObligationLike> = {}): ObligationLike {
  return {
    status: 'open',
    amount: php(189900n),
    applied: php(0n),
    date: '2026-09-20',
    ...over,
  };
}

describe('todayInTimezone', () => {
  it('returns the local calendar date, not the UTC one', () => {
    // 2026-09-13 17:00 UTC is already the 14th in Manila (UTC+8).
    const instant = new Date('2026-09-13T17:00:00Z');
    expect(todayInTimezone('UTC', instant)).toBe('2026-09-13');
    expect(todayInTimezone('Asia/Manila', instant)).toBe('2026-09-14');
  });

  it('handles the other direction too', () => {
    // 2026-09-13 02:00 UTC is still the 12th in Los Angeles.
    const instant = new Date('2026-09-13T02:00:00Z');
    expect(todayInTimezone('America/Los_Angeles', instant)).toBe('2026-09-12');
  });
});

describe('daysBetween', () => {
  it('counts whole calendar days', () => {
    expect(daysBetween('2026-09-13', '2026-09-20')).toBe(7);
    expect(daysBetween('2026-09-13', '2026-09-13')).toBe(0);
    expect(daysBetween('2026-09-20', '2026-09-13')).toBe(-7);
  });

  it('crosses month and year boundaries', () => {
    expect(daysBetween('2026-09-30', '2026-10-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('handles a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2); // 2028 is a leap year
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
  });
});

describe('displayStatus', () => {
  it('is upcoming when the due date is far off', () => {
    expect(displayStatus(bill(), '2026-09-01')).toBe('upcoming');
  });

  it('is due_soon inside the window', () => {
    expect(displayStatus(bill(), '2026-09-18')).toBe('due_soon'); // 2 days
    expect(displayStatus(bill(), '2026-09-17')).toBe('due_soon'); // 3 days, the edge
  });

  it('is upcoming one day outside the window', () => {
    expect(displayStatus(bill(), '2026-09-16')).toBe('upcoming'); // 4 days
  });

  it('is due_today on the day', () => {
    expect(displayStatus(bill(), '2026-09-20')).toBe('due_today');
  });

  it('is overdue only after the day has passed', () => {
    expect(displayStatus(bill(), '2026-09-21')).toBe('overdue');
  });

  it('never marks a paid bill overdue', () => {
    expect(displayStatus(bill({ status: 'paid' }), '2027-01-01')).toBe('paid');
  });

  it('never marks a cancelled bill overdue', () => {
    expect(displayStatus(bill({ status: 'cancelled' }), '2027-01-01')).toBe('cancelled');
  });

  it('treats a fully applied obligation as paid even if lifecycle disagrees', () => {
    // Arithmetic wins over a stale status column.
    const fully = bill({ status: 'open', applied: php(189900n) });
    expect(displayStatus(fully, '2027-01-01')).toBe('paid');
  });

  it('shows partially paid when not near the due date', () => {
    expect(
      displayStatus(
        bill({ status: 'partially_paid', applied: php(50000n) }),
        '2026-09-01',
      ),
    ).toBe('partially_paid');
  });

  it('prioritises overdue over partially paid', () => {
    // A part-paid bill that is late is late — that is the actionable fact.
    expect(
      displayStatus(
        bill({ status: 'partially_paid', applied: php(50000n) }),
        '2026-09-25',
      ),
    ).toBe('overdue');
  });

  it('says missed rather than overdue for expected income', () => {
    expect(displayStatus(bill(), '2026-09-25', { missedInsteadOfOverdue: true })).toBe(
      'missed',
    );
  });

  it('handles a null date', () => {
    expect(displayStatus(bill({ date: null }), '2026-09-13')).toBe('upcoming');
  });

  it('respects a custom due-soon window', () => {
    expect(displayStatus(bill(), '2026-09-14', { dueSoonDays: 7 })).toBe('due_soon');
    expect(displayStatus(bill(), '2026-09-14', { dueSoonDays: 3 })).toBe('upcoming');
  });
});

describe('the timezone trap', () => {
  it('a Manila bill due today is not overdue late in the UTC day', () => {
    // 2026-09-20 17:00 UTC = 2026-09-21 01:00 Manila.
    const instant = new Date('2026-09-20T17:00:00Z');
    const b = bill({ date: '2026-09-21' });

    expect(displayStatus(b, todayInTimezone('Asia/Manila', instant))).toBe('due_today');
    // Using UTC instead would call it due_soon — a day out, every single day.
    expect(displayStatus(b, todayInTimezone('UTC', instant))).toBe('due_soon');
  });
});

describe('remaining', () => {
  it('subtracts what has been applied', () => {
    expect(remaining({ amount: php(189900n), applied: php(100000n) }).minor).toBe(89900n);
  });

  it('is zero when fully applied', () => {
    expect(remaining({ amount: php(189900n), applied: php(189900n) }).minor).toBe(0n);
  });
});

describe('statusTone', () => {
  it('reserves danger for things already late', () => {
    expect(statusTone('overdue')).toBe('danger');
    expect(statusTone('missed')).toBe('danger');
    expect(statusTone('paid')).toBe('success');
    expect(statusTone('cancelled')).toBe('neutral');
  });

  it('warns about what is landing without calling it late', () => {
    expect(statusTone('due_soon')).toBe('warning');
    expect(statusTone('due_today')).toBe('warning');
    expect(statusTone('upcoming')).toBe('neutral');
  });

  it('never gives two different states the same tone and the same label', () => {
    const seen = new Map<string, string>();
    for (const status of [
      'upcoming',
      'due_soon',
      'due_today',
      'overdue',
      'partially_paid',
      'paid',
      'cancelled',
      'missed',
    ] as const) {
      const key = `${statusTone(status)}|${STATUS_LABELS[status]}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, status);
    }
  });
});
