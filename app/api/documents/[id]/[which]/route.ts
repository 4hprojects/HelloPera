import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthResult } from '@/lib/auth/guards';
import { createSignedUrl } from '@/services/storage.service';

/**
 * Redirect to a short-lived signed URL for a document rendition.
 *
 * A route rather than embedding the signed URL in the page: the URL expires in
 * two minutes, so a page cached or left open would otherwise show broken
 * images. This mints one per request instead.
 */
const paramsSchema = z.strictObject({
  id: z.uuid(),
  which: z.enum(['display', 'thumbnail', 'original']),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; which: string }> },
) {
  const auth = await getAuthResult();
  if (!auth.ok) {
    return new NextResponse(
      auth.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden',
      { status: auth.reason === 'unauthenticated' ? 401 : 403 },
    );
  }
  const { user } = auth.context;

  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return new NextResponse('Not found', { status: 404 });
  const { id, which } = parsed.data;

  const url = await createSignedUrl({ userId: user.id, documentId: id, which });
  // Ownership failure and genuinely missing return the same 404: a
  // distinguishable 403 would confirm the document exists.
  if (!url) return new NextResponse('Not found', { status: 404 });

  return NextResponse.redirect(url, {
    // Never cached by a shared proxy — these are private financial documents.
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
