import { NextResponse } from 'next/server';
import { getAuthResult } from '@/lib/auth/guards';
import { createSignedUrl } from '@/services/storage.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NO_STORE = { 'Cache-Control': 'private, no-store' };

/**
 * Redirect to a short-lived signed URL for a document rendition.
 *
 * A route rather than embedding the signed URL in the page: the URL expires in
 * two minutes, so a page cached or left open would otherwise show broken
 * images. This mints one per request instead.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; which: string }> },
) {
  const auth = await getAuthResult();
  if (!auth.ok) {
    return new NextResponse(
      auth.reason === 'unauthenticated' ? 'Unauthorized' : 'Forbidden',
      { status: auth.reason === 'unauthenticated' ? 401 : 403, headers: NO_STORE },
    );
  }
  const { user } = auth.context;

  const { id, which } = await context.params;
  // A malformed id would only reach the database to fail there.
  if (
    !UUID.test(id) ||
    (which !== 'display' && which !== 'thumbnail' && which !== 'original')
  ) {
    return new NextResponse('Not found', { status: 404, headers: NO_STORE });
  }

  const url = await createSignedUrl({ userId: user.id, documentId: id, which });
  // Ownership failure and genuinely missing return the same 404: a
  // distinguishable 403 would confirm the document exists.
  if (!url) return new NextResponse('Not found', { status: 404, headers: NO_STORE });

  return NextResponse.redirect(url, {
    // Never cached by a shared proxy — these are private financial documents.
    headers: NO_STORE,
  });
}
