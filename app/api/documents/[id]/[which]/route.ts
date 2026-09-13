import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { createSignedUrl } from '@/services/storage.service';

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
  const user = await getCurrentUser();
  if (!user) return new NextResponse('Unauthorized', { status: 401 });

  const { id, which } = await context.params;
  if (which !== 'display' && which !== 'thumbnail' && which !== 'original') {
    return new NextResponse('Not found', { status: 404 });
  }

  const url = await createSignedUrl({ userId: user.id, documentId: id, which });
  // Ownership failure and genuinely missing return the same 404: a
  // distinguishable 403 would confirm the document exists.
  if (!url) return new NextResponse('Not found', { status: 404 });

  return NextResponse.redirect(url, {
    // Never cached by a shared proxy — these are private financial documents.
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
