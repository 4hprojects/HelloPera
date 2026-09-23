import 'server-only';

import { isFlagEnabled } from '@/services/plan.service';
import { log } from '@/lib/log';

/**
 * Kill switches — PHASE-14 §22, §23, §85.
 *
 * Two switches, deliberately implemented two different ways, because they are
 * needed in different circumstances.
 *
 * ## `maintenance_mode` is an environment variable, not a feature flag
 *
 * Every other switch in HelloPera is a `feature_flags` row, and Phase 13 gave
 * that table a write path precisely so operators would not need SQL. This one
 * is the exception, for two reasons.
 *
 * The first is the situation it exists for. The usual cause of entering
 * maintenance is that **the database is the problem** — a migration
 * half-applied, a pool exhausted, a restore running. A maintenance switch
 * stored in that database is unreadable at exactly the moment it is needed, and
 * a switch that requires the thing it protects to be healthy is not a switch.
 *
 * The second is cost. It is checked in the proxy, on every request. A flag
 * read there would add a Supabase round trip to every page load, forever, to
 * answer a question whose answer is "no" essentially always.
 *
 * So it is `MAINTENANCE_MODE`, set on the platform, taking effect on the next
 * request with no database involved.
 *
 * ## `financial_writes_enabled` is a flag
 *
 * The opposite case. It is read only when someone is about to write a financial
 * record — rare compared to reads — and it is for when the database is
 * *working* but something else is wrong: a suspected balance bug, a migration
 * about to run, an incident where the ledger should freeze while people can
 * still see their records. The database is available by definition, so the flag
 * is the right home and the admin UI can flip it.
 */

/** §22 — true when the application should serve the maintenance page. */
export function isMaintenanceMode(): boolean {
  const value = process.env.MAINTENANCE_MODE;
  // Only an explicit affirmative. An accidental `MAINTENANCE_MODE=false` or an
  // empty string must not take the site down.
  return value === '1' || value === 'true';
}

export class WritesDisabledError extends Error {
  constructor() {
    super(
      'HelloPera is temporarily read-only while we check something. Your records are safe and nothing has changed.',
    );
    this.name = 'WritesDisabledError';
  }
}

/**
 * §23 — refuse a financial write while the ledger is frozen.
 *
 * Called from the server actions rather than enforced in the UI. A disabled
 * button is not a control: it is a suggestion that anyone with the page already
 * open, or anyone posting to the action directly, never receives.
 *
 * **Fails open on its own failure.** If the flag cannot be read, the write is
 * allowed. That is the opposite of how entitlements fail, and deliberately:
 * `isFlagEnabled` returns false for an unreadable flag, which for this flag
 * would mean an unreachable `feature_flags` table silently freezes every user's
 * ability to record a transaction. Locking people out of their own finances
 * because an operational table hiccuped is worse than briefly honouring a
 * freeze less strictly than intended.
 */
export async function assertWritesEnabled(): Promise<void> {
  let enabled: boolean;
  try {
    enabled = await isFlagEnabled('financial_writes_enabled');
  } catch {
    log.error('kill switch: could not read financial_writes_enabled; allowing the write');
    return;
  }

  if (!enabled) {
    log.warn('kill switch: financial write refused, writes are disabled');
    throw new WritesDisabledError();
  }
}
