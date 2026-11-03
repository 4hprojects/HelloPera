import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET } from '@/services/storage.service';
import { log } from '@/lib/log';
import { requestLogFields } from '@/lib/log/request-id';
import { reuseFor } from '@/lib/utils/reuse-for';

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
async function within<T>(
  label: string,
  work: PromiseLike<T>,
  requestFields: { request_id?: string },
): Promise<boolean> {
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
      ...requestFields,
      dependency: label,
      m: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

type Readiness = { database: boolean; storage: boolean };

/**
 * HP-032. Public, and each check makes two backend calls, so one check serves
 * every caller for five seconds. That bounds the backend cost per instance no
 * matter how often the route is hit, and is still far shorter than any probe
 * interval. A failure logs with the fields of the request that ran the check.
 */
let lastRequestFields: { request_id?: string } = {};
const readiness = reuseFor(5_000, () => check(lastRequestFields));

export async function GET(request: Request): Promise<NextResponse> {
  lastRequestFields = requestLogFields(request.headers);
  const { database, storage } = await readiness();
  const ready = database && storage;

  return NextResponse.json(
    { status: ready ? 'ready' : 'not_ready', database, storage },
    { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  );
}

async function check(requestFields: { request_id?: string }): Promise<Readiness> {
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
      requestFields,
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
      requestFields,
    );
  } catch (error) {
    // A missing service-role key lands here. Not ready, and loud in the log.
    log.error('readiness: could not build a client', {
      ...requestFields,
      m: error instanceof Error ? error.message : 'unknown',
    });
  }

  return { database, storage };
}
