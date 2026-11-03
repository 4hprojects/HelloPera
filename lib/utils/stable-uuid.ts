import { createHash } from 'node:crypto';

/**
 * A UUID that is always the same for the same `seed`.
 *
 * For request ids a retry must reproduce: hashing (rather than random) is what
 * makes the retry land on the same id, and the version and variant bits make
 * it a well-formed UUID.
 */
export function stableUuid(seed: string): string {
  const hex = createHash('sha256').update(seed).digest('hex');
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
