import { describe, expect, it } from 'vitest';
import { benefitsFromExplanation, renderAnswer } from '@/lib/ai/answer';
import { money } from '@/lib/money';
import { AI_INTENTS, type AiIntent } from '@/schemas/ai.schema';
import type { AiAnswerResult } from '@/types/ai';

const php = (major: number) => money(BigInt(Math.round(major * 100)), 'PHP');

const result = (over: Partial<AiAnswerResult> = {}): AiAnswerResult => ({
  intent: 'spending_total',
  range: { from: '2026-09-01', to: '2026-09-30', label: 'This month' },
  currency: 'PHP',
  figures: [{ label: 'Spending', amount: php(8240.5) }],
  items: [],
  truncated: false,
  comparison: null,
  href: null,
  hrefLabel: null,
  empty: false,
  assumptions: [],
  ...over,
});

describe('every intent renders — §51', () => {
  it('produces a non-empty sentence for all nineteen', () => {
    // A missing branch would fall through to a generic line that says nothing.
    for (const intent of AI_INTENTS) {
      const answer = renderAnswer(result({ intent: intent as AiIntent }));
      expect(answer.text, intent).toBeTruthy();
      expect(answer.text.length, intent).toBeGreaterThan(10);
    }
  });

  it('renders figures exactly as lib/money formats them', () => {
    // §24 — the number in the sentence is the number from the executor. Not
    // rounded, not re-derived, not re-formatted by hand.
    const answer = renderAnswer(result());
    expect(answer.text).toContain('₱8,240.50');
  });

  it('never invents a figure that was not supplied', () => {
    const answer = renderAnswer(result({ figures: [] }));
    expect(answer.text).not.toMatch(/₱/);
  });
});

describe('no data is not zero — §25', () => {
  it('says nothing was recorded rather than quoting a zero', () => {
    const answer = renderAnswer(result({ empty: true }));
    expect(answer.text).toMatch(/not recorded/i);
    expect(answer.text).not.toContain('₱0.00');
  });

  it('still quotes a genuine zero total', () => {
    // A real month that happens to total zero is a different fact, and the
    // user is entitled to see it as one.
    const answer = renderAnswer(
      result({ figures: [{ label: 'Spending', amount: php(0) }] }),
    );
    expect(answer.text).toContain('₱0.00');
  });

  it('gives an empty answer no breakdown and no assumptions', () => {
    const answer = renderAnswer(
      result({
        empty: true,
        items: [{ label: 'x', amount: php(1) }],
        assumptions: ['a'],
      }),
    );
    expect(answer.lines).toEqual([]);
  });
});

describe('comparisons state the delta — §22', () => {
  it('names how much more', () => {
    const answer = renderAnswer(
      result({
        figures: [{ label: 'Spending', amount: php(8240.5) }],
        comparison: {
          label: 'Previous period',
          figures: [{ label: 'Spending', amount: php(6910) }],
        },
      }),
    );
    expect(answer.text).toContain('₱1,330.50 more');
    expect(answer.text).toContain('₱6,910.00');
  });

  it('names how much less', () => {
    const answer = renderAnswer(
      result({
        figures: [{ label: 'Spending', amount: php(500) }],
        comparison: {
          label: 'Previous period',
          figures: [{ label: 'Spending', amount: php(800) }],
        },
      }),
    );
    expect(answer.text).toContain('₱300.00 less');
  });

  it('says "the same" rather than "₱0.00 more"', () => {
    const answer = renderAnswer(
      result({
        figures: [{ label: 'Spending', amount: php(500) }],
        comparison: {
          label: 'Previous period',
          figures: [{ label: 'Spending', amount: php(500) }],
        },
      }),
    );
    expect(answer.text).toContain('the same as');
    expect(answer.text).not.toContain('₱0.00 more');
  });
});

describe('cash flow states the direction — §22', () => {
  it('says what was kept', () => {
    const answer = renderAnswer(
      result({
        intent: 'cash_flow',
        figures: [
          { label: 'Income', amount: php(30000) },
          { label: 'Spending', amount: php(21000) },
          { label: 'Net', amount: php(9000) },
        ],
      }),
    );
    expect(answer.text).toContain('kept ₱9,000.00');
  });

  it('says what was overspent, without a minus sign in the phrase', () => {
    // "you overspent by -₱2,000.00" reads as a double negative.
    const answer = renderAnswer(
      result({
        intent: 'cash_flow',
        figures: [
          { label: 'Income', amount: php(10000) },
          { label: 'Spending', amount: php(12000) },
          { label: 'Net', amount: php(-2000) },
        ],
      }),
    );
    expect(answer.text).toContain('overspent by ₱2,000.00');
    expect(answer.text).not.toContain('-₱2,000.00');
  });
});

describe('breakdowns — §23, §49', () => {
  it('lists rows with their figures', () => {
    const answer = renderAnswer(
      result({
        items: [
          { label: 'Food & Dining', amount: php(4200) },
          { label: 'Transport', amount: php(1800) },
        ],
      }),
    );
    expect(answer.lines).toEqual(['Food & Dining — ₱4,200.00', 'Transport — ₱1,800.00']);
  });

  it('includes a date and a status hint when the row has them', () => {
    const answer = renderAnswer(
      result({
        intent: 'bills_due',
        items: [
          { label: 'Meralco', amount: php(3200), date: '2026-09-20', hint: 'due soon' },
        ],
      }),
    );
    expect(answer.lines[0]).toBe('Meralco — 2026-09-20 — ₱3,200.00 (due soon)');
  });

  it('points at the page instead of listing more rows', () => {
    // §49 — "show all" navigates; it does not push rows into a context window.
    const answer = renderAnswer(
      result({
        items: [{ label: 'One', amount: php(1) }],
        truncated: true,
        hrefLabel: 'Open transactions',
      }),
    );
    expect(answer.lines.at(-1)).toContain('Open transactions');
  });

  it('does not claim there is more when nothing was cut', () => {
    const answer = renderAnswer(
      result({
        items: [{ label: 'One', amount: php(1) }],
        hrefLabel: 'Open transactions',
      }),
    );
    expect(answer.lines.join(' ')).not.toContain('and more');
  });
});

describe('when a model is worth calling — §52', () => {
  it('never explains an empty answer', () => {
    expect(
      benefitsFromExplanation(
        result({ empty: true, comparison: { label: 'x', figures: [] } }),
      ),
    ).toBe(false);
  });

  it('does not explain a balance', () => {
    // There is nothing to add to "GCash is at ₱1,240.00" that is not padding,
    // and padding around a number is where a wrong sentence gets in.
    expect(benefitsFromExplanation(result({ intent: 'account_balance' }))).toBe(false);
    expect(benefitsFromExplanation(result({ intent: 'net_position' }))).toBe(false);
    expect(benefitsFromExplanation(result({ intent: 'recent_transactions' }))).toBe(
      false,
    );
  });

  it('explains a comparison, a forecast and cash flow', () => {
    expect(
      benefitsFromExplanation(result({ comparison: { label: 'x', figures: [] } })),
    ).toBe(true);
    expect(benefitsFromExplanation(result({ intent: 'forecast_summary' }))).toBe(true);
    expect(benefitsFromExplanation(result({ intent: 'cash_flow' }))).toBe(true);
  });

  it('explains a breakdown only when there is a distribution to describe', () => {
    const items = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `c${i}`, amount: php(1) }));
    expect(
      benefitsFromExplanation(
        result({ intent: 'spending_by_category', items: items(2) }),
      ),
    ).toBe(false);
    expect(
      benefitsFromExplanation(
        result({ intent: 'spending_by_category', items: items(3) }),
      ),
    ).toBe(true);
  });
});
