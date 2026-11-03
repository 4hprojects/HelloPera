import { stableUuid } from '@/lib/utils/stable-uuid';

/**
 * A stable request id for one draft of one extraction.
 *
 * `create_transaction_idempotent` treats the same id as the same request, so a
 * retried save of draft 3 returns the transaction it already made instead of
 * a second one.
 */
export function draftRequestId(extractionId: string, index: number): string {
  return stableUuid(`${extractionId}:${index}`);
}
