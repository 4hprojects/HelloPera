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
  /**
   * PHASE-12 §43. Not a plan quota — §39's line holds: `ai_queries` in
   * `usage_records` is what someone is entitled to, and this is what stops
   * prompt flooding from one session. Conflating them would let a paid plan
   * buy a higher flood ceiling.
   */
  'ai_question',
  /**
   * PHASE-14 §38. Three endpoints that were uncovered, for three reasons:
   *
   *   ocr_submit       spends real money with a provider on every call. The
   *                    monthly quota bounds the bill; this bounds the burst,
   *                    which is what a script produces before anyone notices.
   *   billing_webhook  a public POST whose only protection is a signature. A
   *                    flood of invalid signatures still costs a verification
   *                    each, and an attacker does not need to pass the check to
   *                    make it expensive.
   *   scheduler        a public POST whose only protection is a secret. The
   *                    limit is per-caller and generous, because a legitimate
   *                    scheduler fires on a schedule and an attacker does not.
   */
  'ocr_submit',
  'billing_webhook',
  'scheduler',
] as const;
export type RateLimitedAction = (typeof RATE_LIMITED_ACTIONS)[number];

export type RateLimitPolicy = {
  /** Attempts permitted inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
  /**
   * Refuse when the limiter itself is unavailable. Set for actions that call a
   * paid API: failing open there turns a database hiccup into an unbounded
   * bill. Sign-in stays fail-open so an outage cannot lock people out.
   */
  failClosed?: true;
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
  /**
   * Looser than the auth actions, because this is a signed-in person using a
   * feature rather than an attacker guessing. Ten a minute is far more than
   * anyone types and far less than a script sends — and the monthly quota,
   * not this, is what bounds the real cost.
   */
  ai_question: { limit: 10, windowSeconds: 60, failClosed: true },
  // Tighter than ai_question: an OCR call costs more and nobody uploads twenty
  // documents a minute by hand.
  ocr_submit: { limit: 6, windowSeconds: 60, failClosed: true },
  /**
   * Generous, and deliberately so. Providers retry aggressively after an
   * outage, and a backlog of legitimate redeliveries arriving at once must not
   * be refused — a dropped webhook is a subscription that silently stops
   * matching reality. This is a ceiling on abuse, not a throttle on normal
   * traffic.
   */
  billing_webhook: { limit: 120, windowSeconds: 60 },
  scheduler: { limit: 30, windowSeconds: 60 },
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

/**
 * The caller's IP from proxy headers, without trusting what the client wrote.
 *
 * A proxy APPENDS to `X-Forwarded-For`, so the leftmost entries are whatever
 * the client sent and the rightmost are what our own proxies saw. With
 * `trustedProxies` in front of the app, the real client is the entry that
 * many places from the right: behind HelloDeploy's nginx alone that is the
 * last entry, whether nginx appends to the header or overwrites it.
 *
 * `CF-Connecting-IP` is only honoured when explicitly trusted — it is a plain
 * request header to anything not behind Cloudflare.
 */
export function clientIpFrom(
  headers: { get(name: string): string | null },
  options: { trustedProxies: number; trustCloudflare: boolean },
): string {
  if (options.trustCloudflare) {
    const cf = headers.get('cf-connecting-ip')?.trim();
    if (cf) return cf;
  }

  const hops = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((hop) => hop.trim())
    .filter(Boolean);
  if (hops.length > 0 && options.trustedProxies > 0) {
    // Fewer hops than trusted proxies means the request skipped a proxy; the
    // leftmost entry is then the best available.
    return hops[Math.max(0, hops.length - options.trustedProxies)]!;
  }

  return headers.get('x-real-ip')?.trim() || 'unknown';
}
