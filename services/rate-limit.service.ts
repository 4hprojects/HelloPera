import 'server-only';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import { env } from '@/lib/env';
import {
  clientIpFrom,
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
  /** The limiter could not be checked and the action fails closed. */
  readonly unavailable: boolean;

  constructor(retryAfterSeconds: number, unavailable = false) {
    super(unavailable ? 'Rate limiter unavailable' : 'Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
    this.unavailable = unavailable;
  }

  /**
   * User-facing copy.
   *
   * Deliberately says nothing about whether the account exists, the password
   * was close, or how many attempts remain — all three are useful to an
   * attacker and useless to the person who mistyped.
   */
  get userMessage(): string {
    if (this.unavailable) {
      return 'This is briefly unavailable. Please try again in a minute.';
    }
    return `Too many attempts. Please try again ${retryAfterLabel(this.retryAfterSeconds)}.`;
  }
}

/**
 * §40 — the caller's IP, for limits not keyed to an identifier.
 *
 * Behind HelloDeploy's nginx the socket address is the proxy, so the forwarded
 * header is the only source. The entry our own proxy added is used, never the
 * leftmost one, which the client controls — reading that let anyone rotate
 * fake IPs past every per-IP limit. See `clientIpFrom` and the
 * TRUSTED_PROXY_COUNT / TRUST_CF_CONNECTING_IP settings.
 */
export async function clientIp(): Promise<string> {
  return clientIpFrom(await headers(), {
    trustedProxies: env.TRUSTED_PROXY_COUNT,
    trustCloudflare: env.TRUST_CF_CONNECTING_IP,
  });
}

/**
 * Record an attempt and throw if it is over the limit.
 *
 * **Fails open by default.** If the limiter itself is unavailable, sign-in
 * keeps working: a database hiccup must not lock every user out of their own
 * finances. The failure is logged loudly, because a silently disabled rate
 * limiter is worth knowing about.
 *
 * Policies marked `failClosed` (the paid-API actions) refuse instead.
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
      log.error(
        policy.failClosed
          ? 'rate limit: check failed, refusing'
          : 'rate limit: check failed, allowing through',
        { action, m: error.code },
      );
      if (policy.failClosed) throw new RateLimitError(60, true);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      log.warn('rate limit: blocked', { action });
      throw new RateLimitError(Number(row.retry_after_seconds ?? policy.windowSeconds));
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    log.error(
      policy.failClosed
        ? 'rate limit: threw, refusing'
        : 'rate limit: threw, allowing through',
      { action, m: error instanceof Error ? error.message : 'unknown' },
    );
    if (policy.failClosed) throw new RateLimitError(60, true);
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
