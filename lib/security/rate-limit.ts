/**
 * Rate limiting — master plan §54a gate item, PHASE-14 §38 to §40.
 *
 * Pure decision logic. The counter lives in Postgres (see
 * `check_rate_limit()`); this module owns the policy and the arithmetic, so
 * both are testable without a database.
 *
 * §39 draws a line worth keeping: **technical rate limits are not plan
 * quotas.** A failed login is abuse protection; an OCR scan is metered usage.
 * Conflating them would either bill people for being attacked or let a paying
 * plan buy a higher brute-force ceiling.
 */

export const RATE_LIMITED_ACTIONS = [
  'login',
  'register',
  'password_reset_request',
  'password_reset_confirm',
  'contact',
] as const;
export type RateLimitedAction = (typeof RATE_LIMITED_ACTIONS)[number];

export type RateLimitPolicy = {
  /** Attempts permitted inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

/**
 * Policies, chosen against what the action costs when abused.
 *
 * Login is the tightest: it is the one an attacker repeats, and a legitimate
 * person who has forgotten their password tries a handful of times, not
 * dozens. Password reset is tighter still in effect, because each attempt
 * sends an email to someone who may not have asked for it — the limit protects
 * the inbox owner, not just the server.
 *
 * Registration is looser, because a shared office NAT genuinely produces
 * several signups in an hour and locking that out is worse than the spam.
 */
export const POLICIES: Record<RateLimitedAction, RateLimitPolicy> = {
  login: { limit: 8, windowSeconds: 15 * 60 },
  register: { limit: 5, windowSeconds: 60 * 60 },
  password_reset_request: { limit: 4, windowSeconds: 60 * 60 },
  password_reset_confirm: { limit: 8, windowSeconds: 15 * 60 },
  contact: { limit: 5, windowSeconds: 60 * 60 },
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. Zero when allowed. */
  retryAfterSeconds: number;
};

/**
 * Decide from a stored count and window start.
 *
 * Fixed window rather than sliding: it is one row and one integer, it is
 * trivially correct, and its known weakness — up to 2× the limit across a
 * window boundary — is irrelevant at these numbers. A sliding window would be
 * more precise about something that does not need precision.
 */
export function evaluate(
  policy: RateLimitPolicy,
  attempts: number,
  windowStartedAtMs: number,
  nowMs: number,
): RateLimitResult {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - windowStartedAtMs) / 1000));

  // The window has passed; this attempt starts a fresh one.
  if (elapsedSeconds >= policy.windowSeconds) {
    return { allowed: true, remaining: policy.limit - 1, retryAfterSeconds: 0 };
  }

  const remaining = policy.limit - attempts;
  if (remaining > 0) {
    return { allowed: true, remaining: remaining - 1, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: policy.windowSeconds - elapsedSeconds,
  };
}

/**
 * The key a limit counts against.
 *
 * Email is lowercased and trimmed so `Foo@Example.com ` and `foo@example.com`
 * share a bucket — otherwise changing the capitalisation resets the counter,
 * which makes the limit decorative.
 */
export function rateLimitKey(action: RateLimitedAction, identifier: string): string {
  return `${action}:${identifier.trim().toLowerCase()}`;
}

/**
 * How long to tell the user to wait, in words.
 *
 * Rounded up to the minute: "try again in 43 seconds" invites counting, and
 * the precision is false anyway once the request reaches a queue.
 */
export function retryAfterLabel(seconds: number): string {
  if (seconds <= 60) return 'in a minute';
  const minutes = Math.ceil(seconds / 60);
  return `in about ${minutes} minutes`;
}
