import { describe, expect, it } from 'vitest';
import {
  DUE_SOON_DAYS,
  ESCALATION_STEPS,
  EXPIRY_DAYS,
  NOTIFICATION_TYPES,
  PREFERENCE_COLUMN,
  dedupeKey,
  escalationStepFor,
  isWithinQuietHours,
} from '@/lib/notifications/rules';

describe('escalation — §48, §49', () => {
  it('does not fire before the first step', () => {
    expect(escalationStepFor(0)).toBeNull();
    expect(escalationStepFor(0.5)).toBeNull();
  });

  it('returns each step exactly at its boundary', () => {
    expect(escalationStepFor(1)).toBe(1);
    expect(escalationStepFor(7)).toBe(7);
    expect(escalationStepFor(30)).toBe(30);
  });

  it('returns the highest step passed, not the nearest', () => {
    // This is what stops the hourly scheduler re-notifying: at day 10 the
    // answer is step 7, whose key was already used on day 7.
    expect(escalationStepFor(10)).toBe(7);
    expect(escalationStepFor(6)).toBe(1);
    expect(escalationStepFor(29)).toBe(7);
  });

  it('stops escalating past the last step', () => {
    expect(escalationStepFor(365)).toBe(30);
    expect(escalationStepFor(10_000)).toBe(30);
  });

  it('yields exactly three reminders over a month of daily runs', () => {
    // §48: "Do not send daily overdue reminders indefinitely."
    const keys = new Set<string>();
    for (let day = 1; day <= 45; day += 1) {
      const step = escalationStepFor(day);
      if (step !== null) keys.add(dedupeKey.billOverdue('42', step));
    }
    expect(keys.size).toBe(ESCALATION_STEPS.length);
    expect([...keys].sort()).toEqual([
      'bill:42:overdue:1',
      'bill:42:overdue:30',
      'bill:42:overdue:7',
    ]);
  });
});

describe('dedupe keys — §17, §18', () => {
  it('keys date-anchored reminders on the date, so they fire once', () => {
    expect(dedupeKey.billDueSoon('42', '2026-09-20')).toBe('bill:42:due_soon:2026-09-20');
    // A different due date is a different occurrence and may fire again.
    expect(dedupeKey.billDueSoon('42', '2026-10-20')).not.toBe(
      dedupeKey.billDueSoon('42', '2026-09-20'),
    );
  });

  it('keys overdue on the step, not the day', () => {
    // The bug this prevents: keying on today would fire every single day.
    expect(dedupeKey.billOverdue('42', 7)).toBe('bill:42:overdue:7');
    expect(dedupeKey.billOverdue('42', 7)).toBe(dedupeKey.billOverdue('42', 7));
  });

  it('keys forecast shortfall on the shortfall date, so a worsening one re-notifies', () => {
    const a = dedupeKey.forecastShortfall('u1', '2026-09-24');
    const b = dedupeKey.forecastShortfall('u1', '2026-09-18');
    expect(a).not.toBe(b);
  });

  it('never collides across entity types with the same id', () => {
    const id = 'same-id';
    const keys = [
      dedupeKey.billDueSoon(id, '2026-09-20'),
      dedupeKey.receivableDueSoon(id, '2026-09-20'),
      dedupeKey.expectedIncomeUpcoming(id, '2026-09-20'),
      dedupeKey.recurringEventUpcoming(id, '2026-09-20'),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('separates due_soon from due_today for the same bill and date', () => {
    expect(dedupeKey.billDueSoon('42', '2026-09-20')).not.toBe(
      dedupeKey.billDueToday('42', '2026-09-20'),
    );
  });
});

describe('quiet hours — §31, §32', () => {
  it('handles a window that wraps midnight', () => {
    // The default 22:00-07:00. A naive start <= t < end is false for every
    // hour of this window and would silently disable the feature.
    expect(isWithinQuietHours('23:30', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('03:00', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('22:00', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('06:59', '22:00', '07:00')).toBe(true);
  });

  it('excludes the end boundary of a wrapping window', () => {
    expect(isWithinQuietHours('07:00', '22:00', '07:00')).toBe(false);
    expect(isWithinQuietHours('12:00', '22:00', '07:00')).toBe(false);
    expect(isWithinQuietHours('21:59', '22:00', '07:00')).toBe(false);
  });

  it('handles a window inside one day', () => {
    expect(isWithinQuietHours('03:00', '01:00', '06:00')).toBe(true);
    expect(isWithinQuietHours('00:30', '01:00', '06:00')).toBe(false);
    expect(isWithinQuietHours('06:00', '01:00', '06:00')).toBe(false);
  });

  it('treats an equal start and end as no quiet hours, not all day', () => {
    // Two matching values in a settings form must not mute everything.
    expect(isWithinQuietHours('03:00', '22:00', '22:00')).toBe(false);
    expect(isWithinQuietHours('22:00', '22:00', '22:00')).toBe(false);
  });
});

describe('configuration completeness', () => {
  it('maps every notification type to a preference column (§42)', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(PREFERENCE_COLUMN[type], type).toBeTruthy();
    }
  });

  it('gives every notification type an expiry (§63)', () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(EXPIRY_DAYS[type], type).toBeGreaterThan(0);
    }
  });

  it('keeps due-soon windows positive and small (§10)', () => {
    for (const [k, v] of Object.entries(DUE_SOON_DAYS)) {
      expect(v, k).toBeGreaterThan(0);
      expect(v, k).toBeLessThanOrEqual(7);
    }
  });
});
