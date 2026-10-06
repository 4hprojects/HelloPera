/**
 * The documents bucket name, importable from browser code.
 *
 * `services/storage.service.ts` is server-only, but the upload form needs the
 * name to send a file straight to Storage with a signed upload URL.
 */
export const BUCKET = 'hello-pera-documents';

/**
 * Where the browser puts a file before the server has looked at it.
 *
 * Kept apart from `<userId>/...` so nothing unchecked ever sits among a
 * user's real documents, and so abandoned uploads are easy to sweep.
 */
export const STAGING_PREFIX = 'incoming';
