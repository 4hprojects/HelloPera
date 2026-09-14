import {
  intentPlanSchema,
  isClarification,
  parserOutputSchema,
  type AiIntent,
  type IntentPlan,
} from '@/schemas/ai.schema';
import { comparisonRange, resolveRange, type ResolvedRange } from '@/lib/ai/dates';

/**
 * Query plan validation — PHASE-12 §12, §29, §30, §31, §32, §47, §48.
 *
 * Pure functions. Everything the model produced is untrusted input, and this is
 * the layer that turns it into something an executor may act on — or refuses.
 *
 * The ownership checks here are not the only protection: RLS scopes every query
 * to the signed-in user regardless (§14, criterion 5). But RLS failing *closed*
 * on a foreign id means an empty result, and an empty result rendered as an
 * answer reads as "you spent nothing", which is a confident lie. So a name that
 * does not resolve to one of the user's own rows becomes a clarification, not a
 * query — defence in depth in one direction, and honesty in the other.
 */

/** §48 — the ceiling on rows any intent may return, whatever the model asked. */
export const MAX_RESULT_ROWS = 10;

/** The intents that read forward in time rather than over history. */
const FORWARD_INTENTS: ReadonlySet<AiIntent> = new Set([
  'bills_due',
  'expected_income',
  'forecast_summary',
]);

/** §87 — intents that cost more than a lookup and are gated by entitlement. */
const PREMIUM_INTENTS: ReadonlySet<AiIntent> = new Set([
  'forecast_summary',
  'monthly_comparison',
  'category_comparison',
]);

export type NamedRow = { id: string; name: string };

/**
 * Everything the assistant needs to know about the user, resolved once.
 *
 * `userId` and `timezone` are not read by `validatePlan` — they are here
 * because the executors need them and this is the one object that travels the
 * whole way. §13: both come from the session. There is no code path that reads
 * a user id out of a question, and the model has never seen one.
 */
export type PlanContext = {
  userId: string;
  /** IANA zone. The analytics service resolves its own "today" from this. */
  timezone: string;
  /** YYYY-MM-DD in the user's timezone. */
  today: string;
  currencies: readonly string[];
  defaultCurrency: string;
  accounts: readonly NamedRow[];
  categories: readonly NamedRow[];
  /** §87 — false for Free users on the intents that need Premium. */
  advancedAnalytics: boolean;
  /** §33 — how far ahead this plan may forecast. */
  forecastHorizonDays: number;
};

export type ValidatedPlan = {
  intent: AiIntent;
  range: ResolvedRange;
  comparison: ResolvedRange | null;
  accountId: string | null;
  categoryId: string | null;
  merchant: string | null;
  currency: string;
  limit: number;
};

export type PlanResult =
  | { ok: true; plan: ValidatedPlan }
  | { ok: false; reason: PlanRejection; message: string };

export type PlanRejection =
  | 'unparseable'
  | 'clarification'
  | 'unknown_account'
  | 'unknown_category'
  | 'unknown_currency'
  | 'entitlement'
  | 'range';

/**
 * Match a name the model lifted from the question against the user's own rows.
 *
 * Case- and whitespace-insensitive, then a contains-match, because people
 * write "food" for "Food & Dining" and "bpi" for "BPI Savings". Deliberately
 * no fuzzy distance: "Savings" matching "Savings" and "Save" alike would
 * silently answer about the wrong account, and being asked which one is far
 * better than being told the wrong number confidently.
 */
export function resolveName(name: string, rows: readonly NamedRow[]): NamedRow | null {
  const needle = name.trim().toLowerCase();
  if (!needle) return null;

  const exact = rows.find((r) => r.name.trim().toLowerCase() === needle);
  if (exact) return exact;

  const contains = rows.filter((r) => r.name.toLowerCase().includes(needle));
  // Exactly one, or it is ambiguous and the user gets asked.
  return contains.length === 1 ? (contains[0] ?? null) : null;
}

/**
 * Validate raw parser output into an executable plan.
 *
 * Takes `unknown` on purpose: this is the first thing the model's output meets,
 * and typing the parameter as `IntentPlan` would mean something upstream had
 * already asserted a shape nobody checked.
 */
export function validatePlan(raw: unknown, context: PlanContext): PlanResult {
  const parsed = parserOutputSchema.safeParse(raw);

  // §47 — never execute a malformed plan.
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'unparseable',
      message: 'I could not turn that into a question I know how to answer.',
    };
  }

  if (isClarification(parsed.data)) {
    return { ok: false, reason: 'clarification', message: parsed.data.clarification };
  }

  const plan: IntentPlan = intentPlanSchema.parse(parsed.data);

  // §87 — entitlement before anything else is resolved, so a Free user is told
  // about the plan rather than about their categories.
  if (PREMIUM_INTENTS.has(plan.intent) && !context.advancedAnalytics) {
    return {
      ok: false,
      reason: 'entitlement',
      message: 'Comparisons and forecasts are part of Premium.',
    };
  }

  // §32 — a currency the user does not hold produces an empty set that would
  // render as a real zero.
  const currency = plan.currency ?? context.defaultCurrency;
  if (!context.currencies.includes(currency)) {
    return {
      ok: false,
      reason: 'unknown_currency',
      message: `You do not have any accounts in ${currency}.`,
    };
  }

  let accountId: string | null = null;
  if (plan.account) {
    const match = resolveName(plan.account, context.accounts);
    if (!match) {
      return {
        ok: false,
        reason: 'unknown_account',
        message: `I could not find an account called "${plan.account}". Which one did you mean?`,
      };
    }
    accountId = match.id;
  }

  let categoryId: string | null = null;
  if (plan.category) {
    const match = resolveName(plan.category, context.categories);
    if (!match) {
      return {
        ok: false,
        reason: 'unknown_category',
        message: `I could not find a category called "${plan.category}". Which one did you mean?`,
      };
    }
    categoryId = match.id;
  }

  let range = resolveRange(plan.dateRange.preset, context.today, {
    from: plan.dateRange.from,
    to: plan.dateRange.to,
  });

  // A backward-looking range on a forward-looking intent is the model
  // misreading tense. Correct it rather than answering "which bills are due
  // next month?" with last month's — the intent is the stronger signal.
  if (FORWARD_INTENTS.has(plan.intent) && !range.forward) {
    range = resolveRange('next-30-days', context.today);
  }

  // §33 — a forecast may not reach past what the plan allows.
  if (plan.intent === 'forecast_summary') {
    const horizon = resolveRange('custom', context.today, {
      from: context.today,
      to: addDays(context.today, context.forecastHorizonDays),
    });
    if (range.to > horizon.to) range = { ...horizon, forward: true };
  }

  return {
    ok: true,
    plan: {
      intent: plan.intent,
      range,
      comparison: plan.comparison ? comparisonRange(range, plan.comparison) : null,
      accountId,
      categoryId,
      merchant: plan.merchant,
      currency,
      // §48 — the model may narrow the result, never widen it.
      limit: Math.min(plan.limit ?? MAX_RESULT_ROWS, MAX_RESULT_ROWS),
    },
  };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
