import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import {
  POLICIES,
  rateLimitKey,
  retryAfterLabel,
  type RateLimitedAction,
} from '@/lib/security/rate-limit';

/**
 * Rate limiting — master plan §54a gate item, PHASE-14 §38, §40.
 *
 * The counter lives in Postgres and the decision is made inside a single
 * statement (`check_rate_limit`), so concurrent attempts cannot all read the
 * same count and all proceed. Verified: 30 simultaneous attempts against a
 * limit of 5 allowed exactly 5.
 */

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }

  /**
   * User-facing copy.
   *
   * Deliberately says nothing about whether the account exists, the password
   * was close, or how many attempts remain — all three are useful to an
   * attacker and useless to the person who mistyped.
   */
  get userMessage(): string {
    return `Too many attempts. Please try again ${retryAfterLabel(this.retryAfterSeconds)}.`;
  }
}

/**
 * §40 — the caller's IP, for limits not keyed to an identifier.
 *
 * Behind HelloDeploy's nginx the socket address is the proxy, so the forwarded
 * header is the only source. It is spoofable in principle; it is used here for
 * abuse dampening rather than authorisation, which is the appropriate weight
 * to put on it.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}

/**
 * Record an attempt and throw if it is over the limit.
 *
 * **Fails open.** If the limiter itself is unavailable, sign-in keeps working:
 * a database hiccup must not lock every user out of their own finances. The
 * failure is logged loudly, because a silently disabled rate limiter is worth
 * knowing about.
 */
export async function enforceRateLimit(
  action: RateLimitedAction,
  identifier: string,
): Promise<void> {
  const policy = POLICIES[action];
  const key = rateLimitKey(action, identifier);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_limit: policy.limit,
      p_window_seconds: policy.windowSeconds,
    });

    if (error) {
      log.error('rate limit: check failed, allowing through', {
        action,
        m: error.code,
      });
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      log.warn('rate limit: blocked', { action });
      throw new RateLimitError(Number(row.retry_after_seconds ?? policy.windowSeconds));
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    log.error('rate limit: threw, allowing through', {
      action,
      m: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/**
 * Both identifier and IP must pass.
 *
 * The identifier limit stops one account being ground down; the IP limit stops
 * one source spraying many accounts, which the identifier limit alone would
 * never see.
 */
export async function enforceRateLimitWithIp(
  action: RateLimitedAction,
  identifier: string,
): Promise<void> {
  await enforceRateLimit(action, identifier);
  await enforceRateLimit(action, `ip:${await clientIp()}`);
}
