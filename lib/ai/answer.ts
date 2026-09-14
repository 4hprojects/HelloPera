import { compare, formatMoney, isZero, subtract, type Money } from '@/lib/money';
import type { AiAnswerResult } from '@/types/ai';

/**
 * Deterministic answers — PHASE-12 §22, §24, §25, §51, §52.
 *
 * §51: "Some queries may not require response-generation AI... Architecture may
 * skip second AI call where unnecessary. This reduces cost and hallucination
 * risk." Both halves of that sentence matter, and the second is the larger one.
 *
 * A balance, a total, a list of bills — these are complete answers the moment
 * the figures exist. Sending them to a model to be rephrased adds latency and
 * cost, and introduces the one risk the whole phase is built to avoid: a
 * sentence that disagrees with the number beside it. So the model is asked only
 * when there is genuinely something to explain (§52), and even then it explains
 * figures it was handed rather than producing any.
 *
 * Everything here is pure, so every intent's phrasing is testable without a
 * database, a session or a key.
 */

const fmt = (m: Money) => formatMoney(m);

/**
 * §25 — "no data" and "zero" are different answers.
 *
 * Conflating them is uniquely bad in a finance app. "You spent ₱0 on food this
 * month" invites someone to conclude their tracking is working; "you have not
 * recorded any food spending this month" tells them it might not be. The
 * executors already distinguish the two with `empty`; this is where the
 * distinction reaches the user.
 */
function emptyAnswer(result: AiAnswerResult): string {
  const period = result.range.label.toLowerCase();
  switch (result.intent) {
    case 'bills_due':
      return `You have no bills recorded as due in that period.`;
    case 'overdue_bills':
      return `You have no overdue bills recorded.`;
    case 'receivables_outstanding':
    case 'overdue_receivables':
      return `You have no outstanding money owed to you recorded.`;
    case 'expected_income':
      return `You have no expected income recorded for that period.`;
    case 'account_balance':
    case 'net_position':
      return `You do not have any ${result.currency} accounts yet.`;
    case 'recent_transactions':
      return `You have not recorded any ${result.currency} transactions yet.`;
    case 'forecast_summary':
      return `There is nothing in your forecast window yet — no bills, expected income or recurring events are recorded for it.`;
    default:
      return `You have not recorded anything for ${period}.`;
  }
}

/** "₱1,200.00 more" / "₱300.00 less" / "the same". §22 wants the delta named. */
function deltaPhrase(current: Money, previous: Money): string {
  const diff = subtract(current, previous);
  if (isZero(diff)) return 'the same as';
  const more = compare(current, previous) > 0;
  const abs = diff.minor < 0n ? { ...diff, minor: -diff.minor } : diff;
  return `${fmt(abs)} ${more ? 'more' : 'less'} than`;
}

function headline(result: AiAnswerResult): string {
  const period = result.range.label.toLowerCase();
  const [first] = result.figures;

  switch (result.intent) {
    case 'cash_flow': {
      const [income, spending, net] = result.figures;
      if (!income || !spending || !net) break;
      const direction = net.amount.minor >= 0n ? 'kept' : 'overspent by';
      const abs =
        net.amount.minor < 0n ? { ...net.amount, minor: -net.amount.minor } : net.amount;
      return `For ${period} you took in ${fmt(income.amount)} and spent ${fmt(
        spending.amount,
      )}, so you ${direction} ${fmt(abs)}.`;
    }

    case 'net_position': {
      const [assets, liabilities, net] = result.figures;
      if (!assets || !liabilities || !net) break;
      return `You hold ${fmt(assets.amount)} across your ${result.currency} accounts and owe ${fmt(
        liabilities.amount,
      )}, leaving a net position of ${fmt(net.amount)}.`;
    }

    case 'account_balance':
      if (!first) break;
      return `${first.label} is at ${fmt(first.amount)}.`;

    case 'income_total':
    case 'income_by_category':
      if (!first) break;
      return `You took in ${fmt(first.amount)} for ${period}.`;

    case 'merchant_spending':
      if (!first) break;
      return `You spent ${fmt(first.amount)} at ${first.label} for ${period}.`;

    case 'bills_due':
      if (!first) break;
      return `You have ${fmt(first.amount)} in bills due ${describeWindow(result)}.`;

    case 'overdue_bills':
      if (!first) break;
      return `You have ${fmt(first.amount)} in overdue bills.`;

    case 'receivables_outstanding':
      if (!first) break;
      return `You are owed ${fmt(first.amount)}.`;

    case 'overdue_receivables':
      if (!first) break;
      return `You are owed ${fmt(first.amount)} that is past its due date.`;

    case 'expected_income':
      if (!first) break;
      return `You are expecting ${fmt(first.amount)} ${describeWindow(result)}.`;

    case 'recent_transactions':
      return `Here are your most recent ${result.currency} transactions.`;

    case 'largest_expenses':
      return `Here are your largest expenses for ${period}.`;

    case 'forecast_summary': {
      const closing = result.figures.at(-1);
      const opening = result.figures[0];
      if (!closing || !opening) break;
      return `Starting from ${fmt(opening.amount)}, your ${result.currency} balance is projected to reach ${fmt(
        closing.amount,
      )}.`;
    }

    default:
      if (!first) break;
      return `You spent ${fmt(first.amount)} for ${period}.`;
  }

  return `Here is what I found for ${period}.`;
}

function describeWindow(result: AiAnswerResult): string {
  return result.range.label.startsWith('Next')
    ? `in the ${result.range.label.toLowerCase()}`
    : `between ${result.range.from} and ${result.range.to}`;
}

/** §22, §23 — the breakdown, as the source of the headline rather than decoration. */
function breakdown(result: AiAnswerResult): string[] {
  if (result.items.length === 0) return [];

  const lines = result.items.map((item) => {
    const parts = [item.label, fmt(item.amount)];
    if (item.date) parts.splice(1, 0, item.date);
    const line = parts.join(' — ');
    return item.hint ? `${line} (${item.hint})` : line;
  });

  // §49 — never more rows; a pointer to the page that can show them all.
  if (result.truncated && result.hrefLabel) {
    lines.push(`…and more. ${result.hrefLabel} to see everything.`);
  }
  return lines;
}

export type DeterministicAnswer = {
  /** The sentence. Every figure in it came from an executor. */
  text: string;
  /** Breakdown rows, already capped and formatted. */
  lines: string[];
  /** §16, §35 — stated plainly under the answer. */
  assumptions: string[];
};

/**
 * Render a result without a model.
 *
 * §52's "simple query → deterministic response template". Used for every
 * answer when no provider is configured (§93), and for simple intents always.
 */
export function renderAnswer(result: AiAnswerResult): DeterministicAnswer {
  if (result.empty) {
    return { text: emptyAnswer(result), lines: [], assumptions: [] };
  }

  let text = headline(result);

  if (result.comparison) {
    const current = result.figures[0];
    const previous = result.comparison.figures[0];
    if (current && previous) {
      text += ` That is ${deltaPhrase(current.amount, previous.amount)} ${result.comparison.label.toLowerCase()} (${fmt(
        previous.amount,
      )}).`;
    }
  }

  return { text, lines: breakdown(result), assumptions: result.assumptions };
}

/**
 * §52 — does this answer benefit from being explained?
 *
 * Deliberately narrow. A comparison has a "why", a forecast has assumptions
 * worth talking through, and a category breakdown has a shape worth naming.
 * A balance does not: there is nothing to add to "GCash is at ₱1,240.00" that
 * is not padding, and padding around a number is where a wrong sentence gets
 * in.
 */
export function benefitsFromExplanation(result: AiAnswerResult): boolean {
  if (result.empty) return false;
  if (result.comparison) return true;

  switch (result.intent) {
    case 'forecast_summary':
    case 'cash_flow':
    case 'monthly_comparison':
    case 'category_comparison':
      return true;
    case 'spending_by_category':
    case 'spending_by_account':
    case 'income_by_category':
      // Only when there is actually a distribution to describe.
      return result.items.length >= 3;
    default:
      return false;
  }
}
