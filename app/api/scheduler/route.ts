import { NextResponse } from 'next/server';
import { deliverPendingPushes } from '@/services/push-delivery.service';
import { log } from '@/lib/log';

/**
 * Push delivery endpoint — PHASE-08 §37, §58; PHASE-07 §2.
 *
 * Generation runs inside Postgres via pg_cron, but push delivery cannot: it
 * needs the VAPID keys and an HTTPS request per subscription, neither of which
 * belongs in a database function. So this endpoint exists to be called on a
 * schedule — by pg_net from the same cron, by a platform scheduler, or by a
 * GitHub Actions workflow (the fallbacks PHASE-07 §2 lists).
 *
 * §58 — "Require secret/token. Restrict method. Do not expose publicly usable
 * scheduler action."
 *
 * The secret is compared in constant time. A plain `===` on a secret leaks its
 * length and, across enough requests, its content through timing; it costs
 * nothing to avoid and is awkward to retrofit once something depends on it.
 *
 * POST only: a GET would be fetched by link previewers, prefetchers and
 * crawlers, any of which would then be running the scheduler.
 */

export const dynamic = 'force-dynamic';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request): Promise<NextResponse> {
  const expected = process.env.SCHEDULER_SECRET;

  // Refuse rather than run unauthenticated. An unset secret on a deployed
  // instance is a public scheduler endpoint, which is exactly what §58
  // forbids — failing closed makes the misconfiguration visible.
  if (!expected) {
    log.error('scheduler: SCHEDULER_SECRET is not set; refusing');
    return NextResponse.json({ error: 'Scheduler is not configured.' }, { status: 503 });
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await deliverPendingPushes();
    log.info('scheduler: push delivery complete', result);
    return NextResponse.json(result);
  } catch (error) {
    log.error('scheduler: push delivery failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Delivery failed.' }, { status: 500 });
  }
}
