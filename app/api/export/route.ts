import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
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

export async function GET(request: Request): Promise<NextResponse> {
  await requireUser();

  const format =
    new URL(request.url).searchParams.get('format') === 'csv' ? 'csv' : 'json';
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
