import { createHash } from 'node:crypto';

/**
 * A stable request id for one draft of one extraction.
 *
 * `create_transaction_idempotent` treats the same id as the same request, so a
 * retried save of draft 3 returns the transaction it already made instead of
 * a second one. Hashing (rather than random) is what makes the retry land on
 * the same id; the version and variant bits make it a well-formed UUID.
 */
export function draftRequestId(extractionId: string, index: number): string {
  const hex = createHash('sha256').update(`${extractionId}:${index}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
    .toString(16)
    .padStart(2, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(18, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}
