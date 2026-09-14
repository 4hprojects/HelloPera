import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET } from '@/services/storage.service';
import { log } from '@/lib/log';

/**
 * Readiness — PHASE-14 §29, §30, §32.
 *
 * "Can this instance actually serve a request?" — which means the database
 * answers and the storage bucket is reachable. Separate from liveness because
 * the correct response differs: a failed readiness check should take an
 * instance out of rotation, a failed liveness check should restart it, and
 * doing the second when you meant the first restarts a healthy process while
 * the real problem continues.
 *
 * ## What it deliberately does not report
 *
 * §32 — no version, no commit, no hostname, no connection string, no error
 * text. A caller gets which dependency is unhealthy and nothing about why: the
 * detail goes to the log, where an operator can see it and a stranger cannot.
 * This endpoint is public and unauthenticated by necessity, so everything it
 * says is said to everyone.
 *
 * OCR, AI and billing are not checked. They are not required to serve a
 * request — the application works without them, degraded — and a readiness
 * probe that fails on a third party's outage would pull every instance out of
 * rotation over a feature most requests never touch.
 */

export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 3000;

/** A hung dependency must fail the check, not hang the probe. */
async function within<T>(label: string, work: PromiseLike<T>): Promise<boolean> {
  try {
    await Promise.race([
      work,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch (error) {
    log.error('readiness: dependency unhealthy', {
      dependency: label,
      m: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

export async function GET(): Promise<NextResponse> {
  let database = false;
  let storage = false;

  try {
    const admin = createAdminClient();

    // The cheapest query that proves the connection works and a table exists.
    // `head: true` fetches no rows.
    database = await within(
      'database',
      admin
        .from('feature_flags')
        .select('key', { count: 'exact', head: true })
        .then(({ error }) => {
          if (error) throw new Error(error.code);
          return true;
        }),
    );

    storage = await within(
      'storage',
      admin.storage
        .from(BUCKET)
        .list('', { limit: 1 })
        .then(({ error }) => {
          if (error) throw new Error(error.message);
          return true;
        }),
    );
  } catch (error) {
    // A missing service-role key lands here. Not ready, and loud in the log.
    log.error('readiness: could not build a client', {
      m: error instanceof Error ? error.message : 'unknown',
    });
  }

  const ready = database && storage;

  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', database, storage },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}
