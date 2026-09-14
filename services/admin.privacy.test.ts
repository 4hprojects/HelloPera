import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { healthFrom } from '@/services/admin.service';

/**
 * PHASE-13 §4, criteria 8, 10, 20, 21.
 *
 * *"Admin can manage the platform without reading private user financial
 * content."*
 *
 * That is a property of what the admin services select, and it is the kind of
 * property that decays quietly: a future page needs one more field, an admin
 * client is already in scope, and the query is three lines. Nothing fails, no
 * test goes red, and the boundary is gone.
 *
 * So the boundary is asserted against the source, in the same spirit as the
 * SQL-parity tests in `lib/recurring` and `lib/monetization`. It is a coarse
 * check — it reads text, it cannot understand intent — but it is a tripwire on
 * exactly the change that would otherwise pass unnoticed, and a deliberate
 * exception has to be argued for in a diff rather than merged by accident.
 */

const SOURCE = readFileSync('services/admin.service.ts', 'utf8');

/** Every `.from('x')` in the file, with the select that follows it. */
function selectsFor(table: string): string[] {
  const pattern = new RegExp(
    `\\.from\\('${table}'\\)[\\s\\S]{0,400}?\\.select\\(([\\s\\S]*?)\\)`,
    'g',
  );
  return [...SOURCE.matchAll(pattern)].map((m) => m[1] ?? '');
}

describe('the admin service never reads private financial content', () => {
  it('reads no column of the financial tables at all', () => {
    // These hold the user's actual money and their actual documents. An admin
    // has no operational reason to see a row of any of them.
    for (const table of [
      'bills',
      'receivables',
      'expected_income',
      'bill_payments',
      'receivable_payments',
      'transaction_tags',
      'recurring_rules',
      'expected_events',
    ]) {
      expect(selectsFor(table), table).toEqual([]);
    }
  });

  it('touches transactions, accounts and documents only to count them', () => {
    // A count is an operational fact ("42 transactions"); which 42 is the
    // user's business. `head: true` means the rows are never fetched.
    for (const table of ['transactions', 'accounts', 'documents']) {
      for (const select of selectsFor(table)) {
        expect(select, `${table}: ${select}`).toMatch(/head:\s*true/);
        expect(select, `${table}: ${select}`).toMatch(/^'id'/);
      }
    }
  });

  it('reads no OCR or extraction content', () => {
    // §24, §25, §26 — job metadata is operational; what the document said is
    // not. `ocr_results` and `extraction_results` hold the text itself.
    expect(selectsFor('ocr_results')).toEqual([]);
    expect(selectsFor('extraction_results')).toEqual([]);
    expect(SOURCE).not.toContain('raw_text');
    expect(SOURCE).not.toContain('visible_text');
  });

  it('reads no assistant conversation content', () => {
    // §28, §29 and §94 of Phase 12 — operational health without the questions.
    expect(selectsFor('ai_conversations')).toEqual([]);
    expect(selectsFor('ai_messages')).toEqual([]);
    for (const select of selectsFor('ai_usage_logs')) {
      expect(select).not.toMatch(/content|prompt|question/);
    }
  });

  it('reads notification delivery state, never the message', () => {
    // `notifications.title` and `.message` are assembled from someone's own
    // bills and balances.
    for (const select of selectsFor('notifications')) {
      expect(select).not.toMatch(/title|message/);
    }
  });

  it('never selects everything from anywhere', () => {
    // `select('*')` is how a column added next year silently becomes visible
    // to admins without anyone deciding that it should.
    expect(SOURCE).not.toMatch(/\.select\('\*'/);
  });
});

describe('provider health — §30', () => {
  it('reports an unconfigured provider honestly', () => {
    // Not "operational". A green light for something that cannot run is worse
    // than no light, because it is believed.
    expect(healthFrom(0, 0, false)).toBe('not_configured');
    expect(healthFrom(100, 0, false)).toBe('not_configured');
  });

  it('treats no traffic as healthy, not degraded', () => {
    // A quiet hour is not an outage, and an indicator that cries wolf at 3am
    // gets ignored by the time it matters.
    expect(healthFrom(0, 0, true)).toBe('operational');
  });

  it('degrades and then fails as the failure rate climbs', () => {
    expect(healthFrom(100, 5, true)).toBe('operational');
    expect(healthFrom(100, 10, true)).toBe('degraded');
    expect(healthFrom(100, 49, true)).toBe('degraded');
    expect(healthFrom(100, 50, true)).toBe('unavailable');
    expect(healthFrom(10, 10, true)).toBe('unavailable');
  });
});
