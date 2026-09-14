import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUE_SOON_DAYS, ESCALATION_STEPS, dedupeKey } from '@/lib/notifications/rules';

/**
 * Parity between the notification constants here and the SQL generator.
 *
 * `run_notification_generation()` carries its own copies of the due-soon
 * windows, the escalation ladder and the dedupe-key shapes, because the
 * scheduler runs inside Postgres (PHASE-07 §2) while the app renders in
 * TypeScript. §10 says these values must not be hardcoded in multiple places;
 * they unavoidably exist twice, so this test is what keeps the two honest.
 *
 * It reads the migration as text rather than executing it — a real database
 * is not available in unit tests, and the failure this guards against is
 * someone changing one copy and not the other.
 */

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260914000400_phase08_notification_generation.sql',
  ),
  'utf8',
);

describe('SQL ↔ TypeScript notification parity — §10, §17, §48', () => {
  it('uses the same due-soon windows', () => {
    expect(MIGRATION).toContain(
      `c_bill_soon       constant integer := ${DUE_SOON_DAYS.bill}`,
    );
    expect(MIGRATION).toContain(
      `c_receivable_soon constant integer := ${DUE_SOON_DAYS.receivable}`,
    );
    expect(MIGRATION).toContain(
      `c_income_soon     constant integer := ${DUE_SOON_DAYS.expected_income}`,
    );
    expect(MIGRATION).toContain(
      `c_event_soon      constant integer := ${DUE_SOON_DAYS.recurring_event}`,
    );
  });

  it('uses the same escalation ladder', () => {
    expect(MIGRATION).toContain(
      `c_steps           constant integer[] := array[${ESCALATION_STEPS.join(', ')}]`,
    );
  });

  it('builds the same dedupe-key prefixes', () => {
    // The prefix is what makes a key collision-free across entity types; the
    // suffix is the cadence. Both halves are asserted by shape.
    const cases: Array<[string, string]> = [
      [
        dedupeKey.billDueSoon('ID', 'DATE'),
        "'bill:' || b.id || ':due_soon:' || b.due_date",
      ],
      [
        dedupeKey.billDueToday('ID', 'DATE'),
        "'bill:' || b.id || ':due_today:' || b.due_date",
      ],
      [dedupeKey.billOverdue('ID', 1), "'bill:' || b.id || ':overdue:' || s.step"],
      [
        dedupeKey.receivableDueSoon('ID', 'DATE'),
        "'receivable:' || r.id || ':due_soon:' || r.due_date",
      ],
      [
        dedupeKey.receivableOverdue('ID', 1),
        "'receivable:' || r.id || ':overdue:' || s.step",
      ],
      [
        dedupeKey.expectedIncomeUpcoming('ID', 'DATE'),
        "'expected_income:' || e.id || ':upcoming:' || e.expected_date",
      ],
      [
        dedupeKey.expectedIncomeMissed('ID', 'DATE'),
        "'expected_income:' || e.id || ':missed:' || e.expected_date",
      ],
      [
        dedupeKey.recurringEventUpcoming('ID', 'DATE'),
        "'recurring_event:' || ev.id || ':upcoming:' || ev.scheduled_date",
      ],
    ];

    for (const [tsKey, sqlExpr] of cases) {
      expect(MIGRATION, sqlExpr).toContain(sqlExpr);
      // The TypeScript prefix must match the SQL literal that starts it.
      const prefix = tsKey.split(':')[0]!;
      expect(sqlExpr.startsWith(`'${prefix}:`), `${tsKey} vs ${sqlExpr}`).toBe(true);
    }
  });

  it('keys overdue on the step and never on a date', () => {
    // The regression that matters: keying overdue on today makes the hourly
    // scheduler notify every single day.
    expect(MIGRATION).not.toContain("':overdue:' || v_today");
    expect(MIGRATION).not.toContain("':overdue:' || b.due_date");
    expect(MIGRATION).not.toContain("':overdue:' || r.due_date");
  });

  it('keys the forecast shortfall on the shortfall date, per §64', () => {
    expect(MIGRATION).toContain("'forecast_shortfall:' || v_u.user_id || ':' || v_first");
  });
});
