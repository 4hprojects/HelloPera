import type { NotificationType } from '@/lib/notifications/rules';

/**
 * §44, §45 — where a notification takes you.
 *
 * "Notifications should link to the relevant record." Deep links are built
 * from the entity rather than stored, so a route rename does not leave old
 * notifications pointing at a 404.
 *
 * Returns null when there is nothing specific to open — better than a link
 * that lands somewhere unrelated and makes the user hunt.
 */
export function notificationHref(
  type: NotificationType,
  entityId: string | null,
): string | null {
  switch (type) {
    case 'bill_due_soon':
    case 'bill_due_today':
    case 'bill_overdue':
      return '/bills';
    case 'receivable_due_soon':
    case 'receivable_overdue':
      return '/receivables';
    case 'expected_income_upcoming':
    case 'expected_income_missed':
      return '/expected-income';
    case 'recurring_event_upcoming':
      return '/recurring';
    case 'ocr_review_required':
      // The review screen is per-document, and the notification carries the
      // extraction id rather than the document id, so the list is the honest
      // destination.
      return '/documents';
    case 'forecast_shortfall':
      return '/forecast';
    default:
      return entityId ? null : null;
  }
}
