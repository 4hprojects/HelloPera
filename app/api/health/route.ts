import { NextResponse } from 'next/server';

/**
 * Liveness — PHASE-14 §29, §31.
 *
 * "Is this process running?" and nothing more. It touches no database, no
 * storage and no provider, because a liveness probe that depends on anything
 * else will report the process as dead when a *dependency* is unwell — and the
 * platform's response to a dead process is to restart it, which cannot fix a
 * database. That is how one slow query becomes a restart loop.
 *
 * Readiness is the other question, and it lives at /api/health/ready.
 *
 * §32 — nothing here reveals a version, a commit, a hostname or a dependency.
 * This is a public URL, and a health endpoint is a reconnaissance target: the
 * useful answer is 200 or not 200.
 */

export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  return NextResponse.json(
    { status: 'ok' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
