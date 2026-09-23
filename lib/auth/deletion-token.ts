import { createHash } from 'node:crypto';
export const DELETION_COOKIE = 'hp-deletion-challenge';
export function deletionTokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function validDeletionChallenge(
  challenge: { user_id: string; expires_at: string; consumed_at: string | null } | null,
  userId: string,
  now = Date.now(),
) {
  return Boolean(
    challenge &&
    challenge.user_id === userId &&
    !challenge.consumed_at &&
    Date.parse(challenge.expires_at) > now,
  );
}

/** Only call with the access token returned by a successful server-side code exchange.
 * Supabase's verified token records the authentication method and its timestamp:
 * https://supabase.com/docs/guides/auth/jwt-fields
 */
export function freshOAuthExchange(
  accessToken: string | undefined,
  startedAt: string,
): boolean {
  try {
    if (!accessToken) return false;
    const claims = JSON.parse(
      Buffer.from(accessToken.split('.')[1]!, 'base64url').toString('utf8'),
    );
    const started = Math.floor(Date.parse(startedAt) / 1000);
    return (
      Array.isArray(claims.amr) &&
      claims.amr.some(
        (entry: { method?: string; timestamp?: number }) =>
          entry.method === 'oauth' &&
          typeof entry.timestamp === 'number' &&
          entry.timestamp >= started,
      )
    );
  } catch {
    return false;
  }
}
