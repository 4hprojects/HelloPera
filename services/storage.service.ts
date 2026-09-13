import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';

/**
 * Supabase Storage access — Phase 04 §37, §38.
 *
 * The bucket has no RLS policies for anon or authenticated. Every read is a
 * short-lived signed URL minted here after an ownership check; every write
 * uses the service role. Storage policies would have to re-derive ownership by
 * parsing the object path, and a parsing mistake there is a cross-user file
 * leak.
 */

export const BUCKET = 'hello-pera-documents';

/**
 * Signed URLs expire quickly on purpose. They are bearer tokens: anyone
 * holding one can read the file, and these are bank statements and receipts.
 * Long-lived links end up in browser history, shared screenshots and logs.
 */
export const SIGNED_URL_TTL_SECONDS = 120;

export async function uploadObject(params: {
  path: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(params.path, params.body, {
    contentType: params.contentType,
    upsert: true,
  });
  if (error) {
    log.error('storage upload failed', { path_depth: params.path.split('/').length });
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

/**
 * Mint a signed URL, but only after confirming the caller owns the document.
 *
 * The ownership check is the whole security boundary here — the storage API
 * itself will sign any path the service role asks for.
 */
export async function createSignedUrl(params: {
  userId: string;
  documentId: string;
  which: 'display' | 'thumbnail' | 'original';
}): Promise<string | null> {
  const admin = createAdminClient();

  const { data: doc } = await admin
    .from('documents')
    .select('user_id, display_path, thumbnail_path, original_path')
    .eq('id', params.documentId)
    .maybeSingle<{
      user_id: string;
      display_path: string | null;
      thumbnail_path: string | null;
      original_path: string | null;
    }>();

  // Admin role does not bypass this (§38). Operational access is not the same
  // as access to a user's private receipts.
  if (!doc || doc.user_id !== params.userId) return null;

  const path =
    params.which === 'display'
      ? doc.display_path
      : params.which === 'thumbnail'
        ? doc.thumbnail_path
        : doc.original_path;

  if (!path) return null;

  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  if (error || !data) {
    log.warn('signed url failed', { which: params.which });
    return null;
  }
  return data.signedUrl;
}

/** Remove every object under a document, used when processing fails. */
export async function removeDocumentObjects(paths: Array<string | null>): Promise<void> {
  const present = paths.filter((p): p is string => Boolean(p));
  if (present.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove(present);
  if (error) {
    // Orphaned objects are a cleanup problem, not a correctness one — never
    // fail the user's request over them (§72).
    log.warn('orphan cleanup failed', { count: present.length });
  }
}
