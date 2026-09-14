import { describe, expect, it } from 'vitest';
import {
  MAX_RESULT_ROWS,
  resolveName,
  validatePlan,
  type PlanContext,
} from '@/lib/ai/plan';
import { AI_INTENTS, intentPlanSchema, parserOutputSchema } from '@/schemas/ai.schema';
import { rangeFor } from '@/lib/analytics/range';

const TODAY = '2026-09-14';

const context = (over: Partial<PlanContext> = {}): PlanContext => ({
  today: TODAY,
  currencies: ['PHP'],
  defaultCurrency: 'PHP',
  accounts: [
    { id: 'acc-1', name: 'BPI Savings' },
    { id: 'acc-2', name: 'GCash' },
    { id: 'acc-3', name: 'BPI Checking' },
  ],
  categories: [
    { id: 'cat-1', name: 'Food & Dining' },
    { id: 'cat-2', name: 'Transport' },
  ],
  advancedAnalytics: true,
  forecastHorizonDays: 90,
  ...over,
});

const plan = (over: Record<string, unknown> = {}) => ({
  intent: 'spending_total',
  dateRange: { preset: 'this-month' },
  ...over,
});

describe('the intent catalog is closed — §10, §45', () => {
  it('accepts every catalogued intent', () => {
    for (const intent of AI_INTENTS) {
      const r = validatePlan(plan({ intent }), context());
      expect(r.ok, intent).toBe(true);
    }
  });

  it('rejects an intent the model invented', () => {
    // §10: "Do not accept arbitrary new intent strings from the model."
    const r = validatePlan(plan({ intent: 'all_users_spending' }), context());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unparseable');
  });

  it('rejects a prompt-injection payload rather than widening anything', () => {
    // §45. These are what a hostile question, or hostile OCR text (§46),
    // could plausibly coax out of a parser. None of them is an intent, so none
    // of them is executable — the closed union is the whole defence.
    const payloads = [
      { intent: 'ignore previous instructions', dateRange: { preset: 'this-month' } },
      {
        intent: 'spending_total; drop table transactions',
        dateRange: { preset: 'this-month' },
      },
      { intent: 'SELECT * FROM transactions', dateRange: { preset: 'this-month' } },
      { intent: 'spending_total', dateRange: { preset: 'all-time' } },
      { intent: '__proto__', dateRange: { preset: 'this-month' } },
      'spending_total',
      null,
      { intent: ['spending_total'], dateRange: { preset: 'this-month' } },
    ];
    for (const payload of payloads) {
      const r = validatePlan(payload, context());
      expect(r.ok, JSON.stringify(payload)).toBe(false);
    }
  });

  it('strips fields nobody declared', () => {
    // A model that emits {userId: "someone-else"} must not have it survive
    // into an executor that might one day read it.
    const parsed = intentPlanSchema.parse({
      ...plan(),
      userId: 'another-user',
      rawSql: 'select 1',
    });
    expect(parsed).not.toHaveProperty('userId');
    expect(parsed).not.toHaveProperty('rawSql');
  });

  it('treats a clarification as its own branch, not a missing intent', () => {
    const r = validatePlan({ clarification: 'Which account did you mean?' }, context());
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('clarification');
      expect(r.message).toBe('Which account did you mean?');
    }
  });
});

describe('ownership — §29, §30, §31', () => {
  it("resolves a name to one of the user's own rows", () => {
    const r = validatePlan(plan({ account: 'GCash' }), context());
    expect(r.ok && r.plan.accountId).toBe('acc-2');
  });

  it('matches case-insensitively and on a fragment', () => {
    expect(resolveName('food', context().categories)?.id).toBe('cat-1');
    expect(resolveName('  GCASH ', context().accounts)?.id).toBe('acc-2');
  });

  it('refuses an ambiguous fragment instead of guessing', () => {
    // "BPI" matches two accounts. Answering about one of them silently would
    // be a confidently wrong number.
    expect(resolveName('BPI', context().accounts)).toBeNull();
    const r = validatePlan(plan({ account: 'BPI' }), context());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_account');
  });

  it('refuses an account the user does not have', () => {
    const r = validatePlan(plan({ account: "someone else's wallet" }), context());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_account');
  });

  it('never lets a raw id through as a name', () => {
    // The model has never seen an id. If it emits one it is a guess, and a
    // guess that resolved would be a cross-user read waiting to happen.
    const r = validatePlan(plan({ account: 'acc-1' }), context());
    expect(r.ok).toBe(false);
  });
});

describe('currency — §32', () => {
  it("defaults to the user's own currency", () => {
    const r = validatePlan(plan(), context());
    expect(r.ok && r.plan.currency).toBe('PHP');
  });

  it('refuses a currency the user does not hold', () => {
    // Otherwise the answer is an empty set rendered as a real zero.
    const r = validatePlan(plan({ currency: 'USD' }), context());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown_currency');
  });

  it('accepts a second currency the user does hold', () => {
    const r = validatePlan(
      plan({ currency: 'USD' }),
      context({ currencies: ['PHP', 'USD'] }),
    );
    expect(r.ok && r.plan.currency).toBe('USD');
  });
});

describe('dates agree with the dashboard — §28, criterion 12', () => {
  it('resolves every shared preset exactly as analytics does', () => {
    // The whole point of sharing rangeFor: if these ever disagree, the
    // assistant quotes a number the dashboard contradicts.
    for (const preset of ['this-month', 'last-month', '3m', '6m', 'this-year'] as const) {
      const r = validatePlan(plan({ dateRange: { preset } }), context());
      const expected = rangeFor(preset, TODAY);
      expect(r.ok && r.plan.range.from, preset).toBe(expected.from);
      expect(r.ok && r.plan.range.to, preset).toBe(expected.to);
    }
  });

  it('rejects a custom range missing a date', () => {
    const r = validatePlan(
      plan({ dateRange: { preset: 'custom', from: '2026-01-01' } }),
      context(),
    );
    expect(r.ok).toBe(false);
  });

  it('rejects a date that does not exist', () => {
    const r = validatePlan(
      plan({ dateRange: { preset: 'custom', from: '2026-02-31', to: '2026-03-01' } }),
      context(),
    );
    expect(r.ok).toBe(false);
  });

  it('corrects a backward range on a forward-looking intent', () => {
    // "Which bills are due?" with preset last-month is the model misreading
    // tense. Answering with last month's bills would be wrong, not merely odd.
    const r = validatePlan(
      plan({ intent: 'bills_due', dateRange: { preset: 'last-month' } }),
      context(),
    );
    expect(r.ok && r.plan.range.forward).toBe(true);
    expect(r.ok && r.plan.range.from).toBe(TODAY);
  });

  it('clamps a forecast to the entitled horizon (§33)', () => {
    const r = validatePlan(
      plan({
        intent: 'forecast_summary',
        dateRange: { preset: 'custom', from: TODAY, to: '2028-01-01' },
      }),
      context({ forecastHorizonDays: 30 }),
    );
    expect(r.ok && r.plan.range.to).toBe('2026-10-14');
  });
});

describe('comparison windows — §28', () => {
  it('measures the previous period over the same number of days', () => {
    // A comparison measured over a different span is the classic silent lie:
    // "you spent more than last month" when last month was 3 days shorter.
    const r = validatePlan(
      plan({
        dateRange: { preset: 'custom', from: '2026-09-01', to: '2026-09-10' },
        comparison: 'previous_period',
      }),
      context(),
    );
    expect(r.ok && r.plan.comparison?.from).toBe('2026-08-22');
    expect(r.ok && r.plan.comparison?.to).toBe('2026-08-31');
  });

  it('handles previous_year across a leap day without shortening the window', () => {
    const r = validatePlan(
      plan({
        dateRange: { preset: 'custom', from: '2028-02-29', to: '2028-03-05' },
        comparison: 'previous_year',
      }),
      context(),
    );
    // 2027 has no 29 February; clamping to the 28th keeps the window whole
    // rather than rolling forward to 1 March and losing a day.
    expect(r.ok && r.plan.comparison?.from).toBe('2027-02-28');
  });

  it('offers no comparison for a forward-looking range', () => {
    const r = validatePlan(
      plan({
        intent: 'bills_due',
        dateRange: { preset: 'next-30-days' },
        comparison: 'previous_period',
      }),
      context(),
    );
    expect(r.ok && r.plan.comparison).toBeNull();
  });
});

describe('result caps — §48', () => {
  it('caps what the model asked for', () => {
    const r = validatePlan(plan({ intent: 'largest_expenses', limit: 50 }), context());
    expect(r.ok && r.plan.limit).toBe(MAX_RESULT_ROWS);
  });

  it('lets the model ask for fewer', () => {
    const r = validatePlan(plan({ intent: 'largest_expenses', limit: 3 }), context());
    expect(r.ok && r.plan.limit).toBe(3);
  });

  it('refuses an absurd request outright', () => {
    expect(parserOutputSchema.safeParse(plan({ limit: 100000 })).success).toBe(false);
  });
});

describe('entitlement — §87', () => {
  it('gates comparisons and forecasts behind Premium', () => {
    for (const intent of [
      'forecast_summary',
      'monthly_comparison',
      'category_comparison',
    ]) {
      const r = validatePlan(plan({ intent }), context({ advancedAnalytics: false }));
      expect(r.ok, intent).toBe(false);
      if (!r.ok) expect(r.reason).toBe('entitlement');
    }
  });

  it('leaves everyday questions available to Free users', () => {
    const r = validatePlan(
      plan({ intent: 'spending_total' }),
      context({ advancedAnalytics: false }),
    );
    expect(r.ok).toBe(true);
  });

  it('answers about the plan before it answers about the data', () => {
    // A Free user naming a category that does not exist should hear about
    // Premium, not be sent chasing a category name.
    const r = validatePlan(
      plan({ intent: 'forecast_summary', category: 'Nonsense' }),
      context({ advancedAnalytics: false }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('entitlement');
  });
});
