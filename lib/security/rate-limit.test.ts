import { describe, expect, it } from 'vitest';
import {
  POLICIES,
  RATE_LIMITED_ACTIONS,
  evaluate,
  rateLimitKey,
  retryAfterLabel,
} from '@/lib/security/rate-limit';

const policy = { limit: 3, windowSeconds: 600 };
const T0 = 1_700_000_000_000;

describe('evaluate — fixed window', () => {
  it('allows the first attempt in a fresh window', () => {
    const r = evaluate(policy, 0, T0, T0);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('counts down to the limit', () => {
    expect(evaluate(policy, 1, T0, T0).remaining).toBe(1);
    expect(evaluate(policy, 2, T0, T0).remaining).toBe(0);
    expect(evaluate(policy, 2, T0, T0).allowed).toBe(true);
  });

  it('blocks exactly at the limit, not one past it', () => {
    // Off-by-one here is the difference between 3 attempts and 4.
    expect(evaluate(policy, 3, T0, T0).allowed).toBe(false);
    expect(evaluate(policy, 4, T0, T0).allowed).toBe(false);
  });

  it('reports how long until the window resets', () => {
    const r = evaluate(policy, 3, T0, T0 + 100_000);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSeconds).toBe(500);
  });

  it('never reports a negative wait', () => {
    const r = evaluate(policy, 3, T0, T0 + 599_000);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('opens a fresh window once the old one has elapsed', () => {
    const r = evaluate(policy, 99, T0, T0 + 600_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
    expect(r.retryAfterSeconds).toBe(0);
  });

  it('treats the boundary second as expired, not blocked', () => {
    expect(evaluate(policy, 99, T0, T0 + 600_000).allowed).toBe(true);
    expect(evaluate(policy, 99, T0, T0 + 599_999).allowed).toBe(false);
  });

  it('tolerates a clock that appears to move backwards', () => {
    // Server clock adjustment, or a row written by another instance. The
    // attempt must not be silently allowed by arithmetic going negative.
    const r = evaluate(policy, 3, T0, T0 - 5_000);
    expect(r.allowed).toBe(false);
  });
});

describe('rateLimitKey', () => {
  it('folds case and whitespace so the counter cannot be reset by retyping', () => {
    // Without this, an attacker alternates capitalisation and the limit never
    // applies — which makes it decorative rather than protective.
    expect(rateLimitKey('login', ' Foo@Example.com ')).toBe('login:foo@example.com');
    expect(rateLimitKey('login', 'foo@example.com')).toBe(
      rateLimitKey('login', 'FOO@EXAMPLE.COM'),
    );
  });

  it('separates actions so one does not consume another budget', () => {
    expect(rateLimitKey('login', 'a@b.c')).not.toBe(rateLimitKey('register', 'a@b.c'));
  });
});

describe('policies', () => {
  it('defines one for every limited action', () => {
    for (const action of RATE_LIMITED_ACTIONS) {
      expect(POLICIES[action], action).toBeTruthy();
      expect(POLICIES[action].limit, action).toBeGreaterThan(0);
      expect(POLICIES[action].windowSeconds, action).toBeGreaterThan(0);
    }
  });

  it('keeps login tighter than registration', () => {
    // Login is the one an attacker repeats. Registration behind a shared NAT
    // legitimately produces several signups, and locking that out is worse
    // than the spam.
    expect(POLICIES.login.limit).toBeLessThan(
      POLICIES.register.limit *
        (POLICIES.register.windowSeconds / POLICIES.login.windowSeconds),
    );
  });

  it('keeps password reset requests scarce', () => {
    // Each one emails someone who may not have asked for it, so the limit
    // protects the inbox owner as much as the server.
    expect(POLICIES.password_reset_request.limit).toBeLessThanOrEqual(5);
  });
});

describe('retryAfterLabel', () => {
  it('avoids false precision', () => {
    expect(retryAfterLabel(5)).toBe('in a minute');
    expect(retryAfterLabel(60)).toBe('in a minute');
    expect(retryAfterLabel(61)).toBe('in about 2 minutes');
    expect(retryAfterLabel(600)).toBe('in about 10 minutes');
  });
});
