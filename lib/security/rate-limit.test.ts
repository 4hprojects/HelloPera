import { describe, expect, it } from 'vitest';
import {
  clientIpFrom,
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

describe('clientIpFrom', () => {
  const headers = (h: Record<string, string>) => new Headers(h);
  const behindNginx = { trustedProxies: 1, trustCloudflare: false };

  it('takes the entry our proxy appended, not the one the client wrote', () => {
    // nginx `$proxy_add_x_forwarded_for`: client value first, real address last.
    const h = headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' });
    expect(clientIpFrom(h, behindNginx)).toBe('203.0.113.9');
  });

  it('cannot be steered by padding the header', () => {
    const h = headers({ 'x-forwarded-for': '9.9.9.9, 8.8.8.8, 7.7.7.7, 203.0.113.9' });
    expect(clientIpFrom(h, behindNginx)).toBe('203.0.113.9');
  });

  it('works when the proxy overwrites the header', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.9' }), behindNginx)).toBe(
      '203.0.113.9',
    );
  });

  it('counts further right for each trusted proxy', () => {
    const h = headers({ 'x-forwarded-for': 'spoof, 203.0.113.9, 172.68.0.1' });
    expect(clientIpFrom(h, { trustedProxies: 2, trustCloudflare: false })).toBe(
      '203.0.113.9',
    );
  });

  it('ignores CF-Connecting-IP unless Cloudflare is trusted', () => {
    const h = headers({
      'cf-connecting-ip': '6.6.6.6',
      'x-forwarded-for': '203.0.113.9',
    });
    expect(clientIpFrom(h, behindNginx)).toBe('203.0.113.9');
    expect(clientIpFrom(h, { trustedProxies: 1, trustCloudflare: true })).toBe('6.6.6.6');
  });

  it('falls back to x-real-ip, then a shared bucket', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '203.0.113.9' }), behindNginx)).toBe(
      '203.0.113.9',
    );
    expect(clientIpFrom(headers({}), behindNginx)).toBe('unknown');
  });
});

describe('paid-API policies fail closed', () => {
  it('marks every action that calls a paid provider', () => {
    expect(POLICIES.ai_question.failClosed).toBe(true);
    expect(POLICIES.ocr_submit.failClosed).toBe(true);
  });

  it('keeps sign-in fail-open', () => {
    expect(POLICIES.login.failClosed).toBeUndefined();
    expect(POLICIES.register.failClosed).toBeUndefined();
  });
});
