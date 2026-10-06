-- Larger document uploads.
--
-- Images may now be up to 25 MB and PDFs up to 20 MB (lib/documents/validation.ts).
-- That is above HelloDeploy's 10 MB proxy limit, so files no longer pass
-- through the app: the browser uploads straight to Storage with a signed
-- upload URL, into `incoming/<user_id>/<uuid>`, and the server reads the bytes
-- back and checks them before moving them into place.
--
-- The bucket limit is the hard ceiling on what a signed upload can send, so it
-- matches the largest allowed file. Per-type limits are enforced by the server.
--
-- Large images do not stay large: after the first successful read, or after a
-- week unread, the original is replaced with the OCR-grade JPEG and
-- retention_status becomes 'optimized_only'.

update storage.buckets
   set file_size_limit = 26214400  -- 25 MB
 where id = 'hello-pera-documents';
