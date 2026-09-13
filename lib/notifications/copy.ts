import type { NotificationType } from '@/lib/notifications/rules';

/**
 * Notification copy — PHASE-08 §47.
 *
 * "Use concise language. Avoid judgmental or alarming wording."
 *
 * Rendered from `metadata` at display time rather than frozen into the row at
 * generation time. Two reasons: a wording fix then reaches reminders already
 * queued, and the generator stays in SQL without having to build prose there.
 * `title`/`message` on the row record what was actually SENT over push, which
 * is a different question from what a row says now.
 *
 * Pure and dependency-free, so every string is testable.
 */

export type NotificationFacts = {
  /** Provider, party, source or rule name. */
  name?: string;
  /** Formatted for display by the caller — this module never touches money. */
  amount?: string;
  /** Days until the date; negative means past. */
  days?: number;
  date?: string;
  count?: number;
};

export type RenderedNotification = {
  title: string;
  message: string;
};

function dayPhrase(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 1) return `in ${days} days`;
  const late = Math.abs(days);
  return late === 1 ? '1 day ago' : `${late} days ago`;
}

const subject = (facts: NotificationFacts, fallback: string): string =>
  facts.name?.trim() || fallback;

/**
 * The wording rules worth stating, because they are easy to undo:
 *
 * - No exclamation marks and no "!" urgency. §47 asks for nothing alarming,
 *   and a finance app that shouts about a ₱200 bill trains people to ignore it.
 * - Overdue is described, never scolded: "is overdue", not "you failed to pay".
 * - The amount is included when known, because the first thing a user wants to
 *   know is whether this is worth opening the app for.
 */
export function renderNotification(
  type: NotificationType,
  facts: NotificationFacts = {},
): RenderedNotification {
  const amount = facts.amount ? ` (${facts.amount})` : '';

  switch (type) {
    case 'bill_due_soon': {
      const when = facts.days === undefined ? 'soon' : dayPhrase(facts.days);
      return {
        title: 'Bill due soon',
        message: `Your ${subject(facts, 'bill')} bill is due ${when}${amount}.`,
      };
    }
    case 'bill_due_today':
      return {
        title: 'Bill due today',
        message: `Your ${subject(facts, 'bill')} bill is due today${amount}.`,
      };
    case 'bill_overdue': {
      const when = facts.days === undefined ? '' : ` since ${dayPhrase(facts.days)}`;
      return {
        title: 'Bill overdue',
        message: `Your ${subject(facts, 'bill')} bill is overdue${when}${amount}.`,
      };
    }

    case 'receivable_due_soon': {
      const when = facts.days === undefined ? 'soon' : dayPhrase(facts.days);
      return {
        title: 'Receivable due soon',
        message: `${subject(facts, 'Someone')} is due to pay you ${when}${amount}.`,
      };
    }
    case 'receivable_overdue':
      return {
        title: 'Receivable overdue',
        message: `Payment from ${subject(facts, 'someone')} is now overdue${amount}.`,
      };

    case 'expected_income_upcoming': {
      const when = facts.days === undefined ? 'soon' : dayPhrase(facts.days);
      return {
        title: 'Income expected',
        message: `${subject(facts, 'Income')} is expected ${when}${amount}.`,
      };
    }
    case 'expected_income_missed':
      return {
        title: 'Expected income not recorded',
        // §20 of Phase 06: expected income that did not arrive is "missed",
        // not "overdue" — nobody owes it and nothing is late.
        message: `${subject(facts, 'Income')} was expected${
          facts.date ? ` on ${facts.date}` : ''
        } and has not been recorded${amount}.`,
      };

    case 'recurring_event_upcoming': {
      const when = facts.days === undefined ? 'soon' : dayPhrase(facts.days);
      return {
        title: 'Upcoming recurring item',
        message: `${subject(facts, 'A recurring item')} is scheduled ${when}${amount}.`,
      };
    }

    case 'ocr_review_required':
      return {
        title: 'Document needs review',
        message:
          facts.count && facts.count > 1
            ? `${facts.count} uploaded documents still need your review.`
            : 'An uploaded document still needs your review.',
      };

    case 'forecast_shortfall':
      return {
        title: 'Projected shortfall',
        // §54 of Phase 07 — "Do not use alarmist language." The same restraint
        // applies here, and more so: this arrives unprompted on a phone.
        message: `Your projected balance may fall below zero${
          facts.date ? ` on ${facts.date}` : ''
        }.`,
      };
  }
}

/**
 * §14, §30 — the push variant, which is deliberately less specific.
 *
 * A push notification renders on a lock screen, in front of whoever is holding
 * the phone. §30 says not to expose sensitive financial detail there and §14
 * repeats it for push specifically, so amounts are dropped and the message
 * says enough to decide whether to open the app — and nothing more.
 */
export function renderPushNotification(
  type: NotificationType,
  facts: NotificationFacts = {},
): RenderedNotification {
  const { amount: _amount, ...withoutAmount } = facts;
  return renderNotification(type, withoutAmount);
}
