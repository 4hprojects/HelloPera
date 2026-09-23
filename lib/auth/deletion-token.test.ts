import { expect, it } from 'vitest';
import {
  deletionTokenHash,
  validDeletionChallenge,
  freshOAuthExchange,
} from './deletion-token';
it('binds approval to the account, expiry, and unused challenge', () => {
  const challenge = {
    user_id: 'a',
    expires_at: '2026-09-23T10:00:00Z',
    consumed_at: null,
  };
  const now = Date.parse('2026-09-23T09:59:00Z');
  expect(validDeletionChallenge(challenge, 'a', now)).toBe(true);
  expect(validDeletionChallenge(challenge, 'b', now)).toBe(false);
  expect(validDeletionChallenge(challenge, 'a', now + 60_000)).toBe(false);
  expect(
    validDeletionChallenge(
      { ...challenge, consumed_at: '2026-09-23T09:58:00Z' },
      'a',
      now,
    ),
  ).toBe(false);
  expect(validDeletionChallenge(null, 'a', now)).toBe(false);
  expect(deletionTokenHash('secret')).not.toContain('secret');
});

it('requires a fresh OAuth exchange rather than a recovery or old session', () => {
  const token = (method: string, timestamp: number) =>
    `header.${Buffer.from(JSON.stringify({ amr: [{ method, timestamp }] })).toString('base64url')}.server-issued`;
  const started = '2026-09-23T10:00:00Z',
    timestamp = Date.parse(started) / 1000;
  expect(freshOAuthExchange(token('oauth', timestamp), started)).toBe(true);
  expect(freshOAuthExchange(token('oauth', timestamp - 1), started)).toBe(false);
  expect(freshOAuthExchange(token('recovery', timestamp), started)).toBe(false);
  expect(freshOAuthExchange(undefined, started)).toBe(false);
});
