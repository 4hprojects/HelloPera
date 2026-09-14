import { describe, expect, it } from 'vitest';
import { INTENT_TOOL, explanationPrompt, intentSystemPrompt } from '@/lib/ai/prompt';
import { AI_INTENTS, AI_RANGE_PRESETS, intentPlanSchema } from '@/schemas/ai.schema';
import { money } from '@/lib/money';
import type { PlanContext } from '@/lib/ai/plan';
import type { AiAnswerResult } from '@/types/ai';

const php = (major: number) => money(BigInt(Math.round(major * 100)), 'PHP');

const context: PlanContext = {
  userId: 'user-1',
  timezone: 'Asia/Manila',
  today: '2026-09-14',
  currencies: ['PHP'],
  defaultCurrency: 'PHP',
  accounts: [{ id: 'acc-1', name: 'GCash' }],
  categories: [{ id: 'cat-1', name: 'Food & Dining' }],
  advancedAnalytics: true,
  forecastHorizonDays: 90,
};

const props = INTENT_TOOL.inputSchema.properties;

describe('the tool schema cannot drift from the validator', () => {
  it('offers exactly the intents Zod accepts', () => {
    // Drift here is silent and expensive: the model is told about an intent
    // the validator rejects, and a perfectly reasonable question comes back
    // "I could not turn that into a question I know how to answer."
    expect([...props.intent.enum]).toEqual([...AI_INTENTS]);
  });

  it('offers exactly the range presets Zod accepts', () => {
    expect([...props.dateRange.properties.preset.enum]).toEqual([...AI_RANGE_PRESETS]);
  });

  it('describes a plan the validator actually parses', () => {
    // A round trip: build the minimal object the tool schema permits and
    // confirm the schema on the other side accepts it.
    const minimal = {
      intent: AI_INTENTS[0],
      dateRange: { preset: AI_RANGE_PRESETS[0] },
    };
    expect(intentPlanSchema.safeParse(minimal).success).toBe(true);
  });

  it('tells the model that names are names, never ids', () => {
    // §29-§31 — the model has never seen an id, and one it invented would be
    // a guess at another row.
    expect(props.account.description).toMatch(/never an id/i);
    expect(props.category.description).toMatch(/never an id/i);
  });

  it('allows a clarification instead of an intent', () => {
    expect(props.clarification).toBeTruthy();
  });
});

describe('the intent prompt grounds the model in this user', () => {
  const prompt = intentSystemPrompt(context);

  it("states today in the user's own timezone", () => {
    // §27 — resolving "last month" against the server's day would be wrong by
    // up to a day for every user not on UTC, which in Manila is all of them.
    expect(prompt).toContain('2026-09-14');
    expect(prompt).toContain('Asia/Manila');
  });

  it('lists the accounts and categories the user actually has', () => {
    expect(prompt).toContain('GCash');
    expect(prompt).toContain('Food & Dining');
  });

  it('survives a user with nothing recorded yet', () => {
    const empty = intentSystemPrompt({ ...context, accounts: [], categories: [] });
    expect(empty).toContain('none yet');
  });

  it('asks for a clarification rather than a guess', () => {
    expect(prompt).toMatch(/clarification is\s+a better answer than a confident guess/i);
  });
});

describe('the explanation call receives figures and nothing else — §50', () => {
  const result: AiAnswerResult = {
    intent: 'spending_by_category',
    range: { from: '2026-09-01', to: '2026-09-30', label: 'This month' },
    currency: 'PHP',
    figures: [{ label: 'Spending', amount: php(8240.5) }],
    items: [{ label: 'Food & Dining', amount: php(4200) }],
    truncated: false,
    comparison: {
      label: 'Previous period',
      figures: [{ label: 'Spending', amount: php(6910) }],
    },
    href: '/analytics',
    hrefLabel: 'Open in analytics',
    empty: false,
    assumptions: ['Balances reflect the transactions you have recorded.'],
  };

  const prompt = explanationPrompt(result, {
    text: 'You spent ₱8,240.50 for this month.',
    lines: [],
    assumptions: [],
  });

  it('passes figures already formatted, so they can only be copied', () => {
    // The model is handed strings, not Money. There is no arithmetic it could
    // do even if it tried.
    expect(prompt.user).toContain('₱8,240.50');
    expect(prompt.user).toContain('₱6,910.00');
    expect(prompt.user).toContain('₱4,200.00');
  });

  it('forbids inventing or recalculating a number', () => {
    expect(prompt.system).toMatch(/never calculate a new total/i);
    expect(prompt.system).toMatch(/never introduce a number/i);
  });

  it('draws the §79 advice boundary', () => {
    expect(prompt.system).toMatch(/does not give financial advice/i);
  });

  it('carries no ids, no raw rows and no internal fields', () => {
    // §18, §50 — what goes to a provider is the smallest thing that can
    // produce the sentence. An id in the payload is an id that can come back
    // out of it.
    expect(prompt.user).not.toContain('acc-1');
    expect(prompt.user).not.toContain('cat-1');
    expect(prompt.user).not.toContain('user-1');
    expect(prompt.user).not.toContain('minor');
    expect(prompt.user).not.toContain('href');
  });

  it('states the assumptions, so the answer can repeat them', () => {
    expect(prompt.user).toContain('Balances reflect the transactions you have recorded.');
  });
});
