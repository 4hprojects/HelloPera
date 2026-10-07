import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthResult } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import {
  ExportError,
  buildExport,
  toCsvExport,
  toJsonExport,
} from '@/services/export.service';

/**
 * Data export download — master plan §54a gate item, PHASE-14 §67, §68.
 *
 * A route handler rather than a server action, because the result is a file
 * the browser must save. A server action returns serialisable data to React;
 * it cannot set `Content-Disposition`.
 *
 * `requireUser()` guards it, and every read inside is RLS-scoped, so there is
 * no parameter through which one user could request another's export.
 */

export const dynamic = 'force-dynamic';

const querySchema = z.strictObject({ format: z.enum(['csv', 'json']).optional() });

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await getAuthResult();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden' },
      { status: auth.reason === 'unauthenticated' ? 401 : 403 },
    );
  }

  // Strict: an unknown or repeated query parameter is refused, not ignored.
  const params = new URL(request.url).searchParams;
  const query = querySchema.safeParse(Object.fromEntries(params));
  if (!query.success || new Set(params.keys()).size !== params.size) {
    return NextResponse.json({ error: 'Unsupported export options.' }, { status: 400 });
  }
  const format = query.data.format ?? 'json';
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    const bundle = await buildExport();
    const body = format === 'csv' ? toCsvExport(bundle) : toJsonExport(bundle);

    return new NextResponse(body, {
      headers: {
        'Content-Type':
          format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="hellopera-export-${stamp}.${format}"`,
        // This is the user's complete financial history. It must not sit in a
        // shared cache, a CDN, or the browser's disk cache.
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    if (error instanceof ExportError) {
      // Deliberately a 500 with the real reason: an incomplete export is a
      // failure, and the user needs to know nothing was downloaded rather
      // than receive a truncated file.
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    log.error('export failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'We could not build your export. Please try again.' },
      { status: 500 },
    );
  }
}
