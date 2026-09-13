# HelloPera — Phase 04: Documents and Image Processing

## 1. Objective

Build HelloPera's secure financial document ingestion and image-processing layer.

At the end of this phase, an authenticated user should be able to:

- Upload receipt photos
- Upload screenshots
- Upload bills
- Upload payment confirmations
- Upload supported image files
- Upload supported PDFs
- Store documents privately in Supabase Storage
- Convert supported images to optimized WebP
- Generate thumbnails
- Preserve OCR-quality processing input
- Store document metadata in PostgreSQL
- View a private document library
- Open documents through signed URLs
- Archive documents
- Apply file validation and size limits
- Track processing status
- Keep permanent files out of the HelloDeploy local filesystem

OCR is intentionally not implemented in this phase.

---

## 2. Dependencies

Phase 04 requires Phase 03 to be complete.

Required prior capabilities:

- Authenticated users
- RBAC
- RLS
- Accounts
- Transactions
- Bills
- Receivables
- Expected income
- Audit logging
- HelloDeploy production deployment
- Dedicated Supabase project

---

## 3. Scope

### Included

- Document upload UI
- Mobile camera/file input support
- Image validation
- PDF validation
- Private Supabase Storage
- Secure object paths
- Image orientation normalization
- WebP conversion
- Thumbnail generation
- Image resizing
- Metadata stripping where appropriate
- Document metadata table
- Processing status
- File size tracking
- Image dimension tracking
- Signed URLs
- Document list
- Document detail
- Archive behavior
- Original-file retention foundation
- Error handling
- Storage RLS/policies
- Basic upload rate/size controls

### Out of Scope

Do not implement yet:

- OCR
- Text extraction
- AI extraction
- Document classification by content
- Automatic transaction creation
- Duplicate transaction detection
- Full PDF text extraction
- Automatic receipt cropping
- Advanced image deskew
- Background queue workers unless required
- Bulk statement import
- Cloud OCR APIs
- AI vision

---

## 4. Core Architecture

```text
User Upload
↓
Server Validation
↓
Temporary Processing
↓
Image/PDF Handling
↓
Supabase Storage
↓
documents table
↓
Private Document Library
```

For images:

```text
Original Upload
↓
Validate
↓
Normalize Orientation
↓
Create OCR-Quality Working Version
↓
Generate Display WebP
↓
Generate Thumbnail WebP
↓
Store Metadata
```

OCR starts in Phase 05.

---

## 5. Storage Responsibility

Permanent document files must live in:

```text
Supabase Storage
```

Do not use HelloDeploy local disk as the system of record.

HelloDeploy may use temporary filesystem space only during processing.

Temporary files must be cleaned up.

---

## 6. Storage Bucket

Use one private bucket:

```text
hello-pera-documents
```

Keep the bucket private.

Do not create public financial document URLs.

---

## 7. Suggested Object Path

```text
user-id/
  year/
    month/
      document-id/
        display.webp
        thumb.webp
        original.ext
```

If originals are not retained permanently:

```text
user-id/
  year/
    month/
      document-id/
        display.webp
        thumb.webp
```

Use generated UUIDs.

Do not rely on original filenames as object keys.

---

## 8. Original Filename

Store the original client filename only as metadata.

Example:

```text
original_filename = "gcash-payment-sep12.png"
```

Do not assume it is safe as a storage path.

Sanitize for display.

---

## 9. Documents Table

Suggested schema:

```text
documents

id
user_id
document_type
original_filename
original_mime_type
original_size_bytes
storage_bucket
display_path
thumbnail_path
original_path
display_mime_type
display_size_bytes
thumbnail_size_bytes
width
height
page_count
processing_status
retention_status
is_archived
created_at
updated_at
```

Possible future fields:

```text
ocr_status
ocr_text
classification
content_hash
duplicate_of_document_id
```

Do not add OCR fields yet unless nullable placeholders clearly help migration strategy.

---

## 10. Document Types

Initial user-selectable or generic types:

```text
receipt
screenshot
bill
payment_confirmation
bank_record
ewallet_record
invoice
statement
salary_record
other
```

Do not require perfect classification.

Phase 05 may later classify or refine type.

---

## 11. Processing Status

Suggested statuses:

```text
uploaded
processing
ready
failed
archived
```

Recommended lifecycle:

```text
uploaded
↓
processing
↓
ready
```

On error:

```text
processing
↓
failed
```

Archive remains a separate flag if preferred.

---

## 12. Retention Status

Suggested values:

```text
original_retained
original_temporary
original_deleted
optimized_only
```

This helps manage storage policy later.

---

## 13. Supported Image Formats

Initial recommendation:

```text
JPEG
PNG
WebP
HEIC/HEIF if Sharp/runtime support is verified
```

Do not claim HEIC support until tested in HelloDeploy.

Optional later:

```text
TIFF
BMP
```

Only if there is a real need.

---

## 14. Supported Document Format

Initial PDF support:

```text
PDF
```

Phase 04 only needs:

- Safe upload
- Metadata
- Private storage
- Preview/download where feasible

OCR/text extraction from PDF belongs to Phase 05.

---

## 15. MIME Validation

Validate both:

- File extension
- MIME/content signature where practical

Do not trust client-provided MIME type alone.

Reject unsupported or suspicious files.

---

## 16. File Size Limits

### The Platform Caps Requests at 10 MB

HelloDeploy's nginx sets `client_max_body_size 10m` on every deployed app
(`PLATFORM-HELLODEPLOY.md`, row Q1). An earlier draft proposed 20 MB PDFs;
that is unreachable, and a 10 MB image would also fail once multipart
overhead is counted.

Initial values:

```text
Images:  8 MB
PDFs:    8 MB
```

Enforce them **client-side before upload** as well as server-side, so an
oversized file produces a real message rather than an opaque nginx 413 that
never reaches the application.

If the limit starts to bite, the fix is to upload directly to Supabase
Storage with a signed upload URL and process the stored object server-side —
bypassing the proxy entirely. That is the better long-term shape for a
document-heavy product, but it is a rearchitecture, not a config change. Do
not start there.

Limits stay environment/config driven. Do not hardcode in multiple
components.

---

## 17. Image Dimension Limits

Protect the image pipeline from decompression bombs and extreme dimensions.

Suggested initial maximum:

```text
12000 x 12000 px
```

Exact value should be configurable and tested.

Reject or safely downsample excessive files.

---

## 18. Upload Count Limits

Basic abuse protection should exist.

Example configurable limits:

```text
N uploads per minute
N uploads per day
```

Full usage quotas belong to monetization phases.

Phase 04 only needs basic technical rate protection.

---

## 19. Image Processor

Use:

```text
Sharp
```

Responsibilities:

- Read metadata
- Auto-rotate
- Resize
- Convert to WebP
- Generate thumbnail
- Strip unnecessary metadata
- Return dimensions
- Return output sizes

---

## 20. Orientation

Use EXIF orientation handling where available.

Flow:

```text
input
↓
auto-rotate
↓
normalized output
```

Do not preserve visibly rotated receipts.

---

## 21. Display WebP

Suggested configurable defaults:

```text
max_dimension = 1800px
quality = 85
```

Preserve aspect ratio.

Do not upscale small images unnecessarily.

---

## 22. Thumbnail WebP

Suggested configurable defaults:

```text
max_dimension = 360px
quality = 75
```

Use for:

- Document lists
- Cards
- Previews

Do not load full display image in list views.

---

## 23. OCR-Quality Working Version

Phase 04 should preserve enough quality for Phase 05.

Recommended strategy:

- Process original in memory/temp storage
- Create display WebP at good quality
- Optionally retain original temporarily until OCR succeeds
- Do not overcompress before OCR

OCR may use:

```text
original temporary file
or
high-quality normalized image
```

Phase 05 will finalize which source is authoritative for OCR.

---

## 24. Metadata Stripping

Strip unnecessary metadata from optimized WebP outputs where practical.

Benefits:

- Smaller files
- Less accidental metadata exposure
- Better privacy

Do not preserve location metadata unless there is a concrete feature need.

---

## 25. EXIF Privacy

Financial photo uploads may contain:

```text
GPS location
device model
capture timestamp
```

HelloPera should not preserve GPS metadata by default.

If original files are retained, document this privacy implication.

---

## 26. Original Retention Strategy

The OCR-quality source is retained until the **extraction is resolved**, not
until OCR merely completes:

```text
Upload
↓
Generate optimized versions
↓
retention_status = original_retained
↓
OCR runs against the retained source
↓
Extraction reaches confirmed OR discarded
↓
Retention timer starts
↓
Delete original; keep display.webp + thumb.webp
```

### Why Not "Delete After OCR Succeeds"

Because OCR succeeding is not the end of the process. After it:

- The user reviews and may request a re-run (`PHASE-05` §43).
- An admin may retry a job (`PHASE-13` §27).
- The provider may be swapped, making old results worth regenerating.

If the original is gone, all three run against an 1800px quality-85 WebP — the
display copy, compressed for viewing, not for reading small print. `PHASE-05`
§62 explicitly warns to check that compression has not damaged text; deleting
the source guarantees that it has.

The result would be a retry that silently produces worse output than the
original attempt, with nothing in the UI explaining why.

### Requirements

- Retry paths check `retention_status` before starting and fail with a clear
  message when the source is gone, rather than silently degrading.
- The retention timer is configurable and starts at extraction resolution.
- An unresolved extraction never triggers deletion, however old it is.

Phase 05 §10 implements the trigger; Phase 04 provides the state.

---

## 27. PDF Handling

Do not convert PDFs to WebP as a single file.

For Phase 04:

- Store PDF privately
- Record page count if feasible
- Generate preview thumbnail only if implementation is reliable
- Otherwise use a generic PDF preview icon

### PDF Page Rendering Is a Native Dependency

`PHASE-05` §63 needs PDF pages rasterised whenever the chosen OCR provider
cannot accept a PDF directly. That requires poppler, pdfium or equivalent on
the host — a **second** native dependency alongside Sharp, on a platform
whose native-module support is itself being verified for the first time in
Phase 00.

Discovering this in Phase 05 means discovering it after the document pipeline
is built.

**This is already decided by the platform.** HelloDeploy generates its own
Dockerfile — HelloPera cannot add `apk` packages to the image — so poppler and
pdfium are simply not available (`PLATFORM-HELLODEPLOY.md`, row I3).

Therefore:

```text
Choose an OCR provider that accepts PDFs natively.
```

This becomes a hard selection criterion in `PHASE-05` §7, alongside accuracy
and cost. Google Vision, AWS Textract and Azure all accept PDFs directly;
a Tesseract-only approach would need rasterising HelloPera cannot perform.

If no acceptable provider offers native PDF input, the fallback is to restrict
OCR to images and keep PDFs as stored, viewable documents — degrading the
feature rather than the architecture.

---

## 28. Upload Flow

Suggested UI:

```text
Capture / Upload
↓
Take Photo
Choose Image
Choose PDF
↓
Optional Document Type
↓
Upload
↓
Processing
↓
Ready
```

Mobile should expose camera capture when supported.

---

## 29. Mobile Camera Input

Use mobile-friendly file input:

```text
accept="image/*"
```

and capture hint where appropriate.

Do not assume every browser honors the same capture behavior.

Provide gallery fallback.

---

## 30. Upload Progress

Show:

- Uploading
- Processing
- Ready
- Failed

Do not leave users guessing whether a large file completed.

---

## 31. Failed Processing

If image conversion fails:

- Keep status `failed`
- Store useful error metadata server-side
- Do not expose raw stack traces
- Allow retry
- Clean temporary files

---

## 32. Retry

Add a retry path for failed processing.

Do not create duplicate document records on every retry if avoidable.

Use the same document ID where practical.

---

## 33. Idempotency

Protect upload processing from duplicate execution.

Possible strategy:

```text
document_id
+
processing operation id
```

Before processing, check current status.

Avoid generating multiple copies of the same output due to repeated requests.

---

## 34. Content Hash

Optional but recommended foundation:

Compute a cryptographic hash such as:

```text
SHA-256
```

for the original upload.

Store:

```text
content_hash
```

This helps later with:

- Duplicate document detection
- Idempotency
- Integrity checks

Do not automatically merge duplicates yet.

---

## 35. Document Library

Route:

```text
/documents
```

Show:

- Thumbnail
- Type
- Original filename
- Upload date
- Status
- File size
- Optional linked record count later

Filters:

```text
type
date
status
archived
```

---

## 36. Document Detail

Route:

```text
/documents/[id]
```

Show:

- Preview
- Document type
- Original filename
- Original format
- Original size
- Optimized size
- Upload date
- Dimensions
- Processing status
- Retention status

Future:

- OCR text
- Extracted fields
- Linked transactions
- Linked bills

---

## 37. Signed URL Access

Generate short-lived signed URLs server-side.

Do not store permanent public URLs.

Suggested expiration:

```text
60–300 seconds
```

Exact value configurable.

---

## 38. URL Security

Signed URL generation must verify:

```text
document.user_id == current user
```

Admin role should not bypass this by default.

---

## 39. Document Archival

Users may archive documents.

Archived documents:

- Hidden from default list
- Still accessible in archive
- Retain links to future financial records
- Not physically deleted

---

## 40. Document Deletion

Permanent deletion should not be a normal primary action.

Future account deletion may remove all storage objects.

For Phase 04, prefer:

```text
Archive
```

over:

```text
Delete
```

If hard delete is implemented for unlinked documents:

- Verify ownership
- Verify no financial links
- Delete storage objects
- Delete DB row atomically where possible
- Audit action

---

## 41. Future Financial Linking

Documents should be designed to link later to:

```text
transactions
bills
receivables
expected_income
```

Do not force a document to belong to only one record.

Recommended future design:

```text
document_links
```

with:

```text
document_id
entity_type
entity_id
```

Do not implement if not needed yet, but reserve the concept.

---

## 42. Suggested Services

```text
services/
  document.service.ts
  image-processing.service.ts
  storage.service.ts
```

Future:

```text
ocr.service.ts
```

belongs to Phase 05.

---

## 43. Data Access

No repository layer — see `PHASE-02` §39.

`storage.service.ts` encapsulates Supabase Storage calls, since they are a
genuinely separate concern from document metadata.

---

## 44. Suggested Validation Schemas

```text
schemas/
  document-upload.schema.ts
  document-update.schema.ts
```

Validate:

- File type
- File size
- Document type
- User ownership
- Archive action

---

## 45. Temporary Files

If Sharp requires temporary filesystem use:

- Use OS temp directory
- Generate random names
- Never use user filename directly
- Delete after success
- Delete after failure
- Do not assume persistence

---

## 46. Memory Safety

Do not load arbitrarily large files fully into memory without limits.

Use configured file-size and dimension limits.

Monitor Sharp memory behavior.

---

## 47. Server Runtime

Image processing requires Node.js runtime.

Do not deploy the conversion endpoint to an Edge runtime if Sharp is incompatible.

Explicitly configure Node runtime where required.

---

## 48. HelloDeploy Compatibility

These were verified in Phase 00 against `PLATFORM-HELLODEPLOY.md`. Confirm
they still hold under real upload load:

- Sharp installs successfully (row I1)
- Sharp native binaries run (row I1)
- Node runtime, not Edge, for the processing route (row R2)
- Temp directory is writable, with known free space (row I2)
- Upload body limit supports `MAX_PDF_BYTES` (row Q1)
- PDF rendering dependency, **if** §27 selected that path (row I3)
- Production build includes required native dependencies

### Sharp on Alpine with Standalone Output

HelloDeploy builds on `node:22-alpine` and ships `.next/standalone`, so Sharp
faces both a libc question and a dependency-tracing question.

A spike on 2026-09-13 (Next 15.5.4, Sharp 0.34.4) showed tracing is **not** a
problem: standalone output carries Sharp plus both glibc and musl binaries,
and the server runs — with a bare `output: 'standalone'` and no extra config.
See `PLATFORM-HELLODEPLOY.md` note A.

What remains unproven is that the musl binary *loads* under Alpine. Confirm in
Phase 00 by deploying a route that actually calls Sharp and hitting it. A green
build proves nothing.

Fallback if it fails: `@jsquash/webp`, a WASM codec. Slower, but immune to the
libc question.

This is a critical Phase 04 deployment gate. If any row regressed since
Phase 00, adopt its fallback before continuing.

---

## 49. Supabase Storage Policies

Private bucket policies must ensure:

- User can access own objects only
- User cannot list another user's objects
- User cannot overwrite another user's path
- Server-side processing can write optimized outputs securely

Object path should begin with authenticated user ID.

---

## 50. Storage Path Rule

Conceptual policy:

```text
first path segment
=
auth.uid()
```

Example:

```text
<user_uuid>/2026/09/<document_uuid>/display.webp
```

---

## 51. RLS Requirements

Enable RLS on:

```text
documents
```

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

Document rows are created by the upload server action and mutated only by the
processing service.

These fields have no client-writable path at all:

```text
user_id
storage_bucket / display_path / thumbnail_path / original_path
processing_status
retention_status
content_hash
width / height / page_count / size fields
```

They are outputs of server-side processing. A client able to set
`processing_status = ready` would surface a document that was never processed;
a client able to set `display_path` could point a row at another user's
object.

The only user-editable metadata is `document_type` and the archive flag, both
through a server action with an explicit allowlist.

---

## 52. Service Role Usage

If server processing uses Supabase service-role credentials:

- Keep key server-only
- Validate current authenticated user
- Restrict operations to the intended document path
- Do not expose service-role key to client bundle

---

## 53. Upload Security

Reject:

- Executables
- Scripts
- Archives
- Unsupported formats
- Polyglot/suspicious files where detectable
- Files exceeding size/dimension limits

Do not rely on extension alone.

---

## 54. Filename Security

Sanitize filename before display.

Never render user filenames as raw HTML.

Storage key should not use unsanitized filename.

---

## 55. Privacy

Financial documents may contain:

- Account numbers
- Names
- Addresses
- Transaction references
- Balances

Therefore:

- Bucket private
- Signed access only
- No public CDN URL
- No unnecessary metadata exposure
- No analytics service should receive raw document content unless explicitly intended

---

## 56. Logging

Log:

```text
document upload started
document upload completed
processing started
processing completed
processing failed
document archived
```

Do not log:

- Full document content
- Account numbers
- OCR text
- Sensitive filenames if avoidable

---

## 57. Audit Events

Suggested events:

```text
document_uploaded
document_processed
document_processing_failed
document_archived
document_unarchived
document_deleted
```

---

## 58. Image Size Savings

Store:

```text
original_size_bytes
display_size_bytes
thumbnail_size_bytes
```

This allows later analytics such as:

```text
storage saved by optimization
```

Do not expose this as user-facing analytics unless useful.

---

## 59. Compression Ratio

Optional derived metric:

```text
compression_ratio
=
display_size / original_size
```

Do not persist unless needed.

Can be calculated.

---

## 60. Accessibility

Upload UI must support:

- Keyboard file selection
- Clear labels
- Upload status text
- Error announcements
- Preview alt text based on document type, not sensitive content
- Non-color-only status indicators

---

## 61. UI Theme

Use HelloPera Jade.

Document status semantics:

```text
ready       → success
processing  → jade/gold
failed      → danger
archived    → muted
```

---

## 62. Empty State

Example:

```text
No documents yet

Upload a receipt, screenshot, bill, or statement to keep your financial records organized.
```

---

## 63. File Preview

Images:

- Use thumbnail in list
- Use display WebP in detail

PDF:

- Generic preview or safe embedded preview
- Do not expose direct permanent URL

---

## 64. Search

Basic document search may include:

```text
original filename
document type
upload date
```

OCR text search belongs to Phase 05.

---

## 65. Filters

Support:

```text
document type
processing status
date range
archived
```

---

## 66. Sorting

Support:

```text
newest
oldest
largest
smallest
```

---

## 67. Database Migration

Create migration for:

```text
documents
constraints
indexes
RLS
policies
```

If `content_hash` is included, index it per user if useful.

---

## 68. Suggested Indexes

```text
documents(user_id)
documents(created_at)
documents(document_type)
documents(processing_status)
documents(user_id, content_hash)
```

Do not over-index.

---

## 69. Configuration

Centralize:

```text
MAX_IMAGE_BYTES
MAX_PDF_BYTES
MAX_IMAGE_DIMENSION
DISPLAY_WEBP_QUALITY
DISPLAY_MAX_DIMENSION
THUMB_WEBP_QUALITY
THUMB_MAX_DIMENSION
SIGNED_URL_TTL
```

Do not scatter constants.

---

## 70. Error Messages

Examples:

```text
This file type is not supported.
This image is too large.
This PDF exceeds the upload limit.
We could not process this image.
Upload failed. Please try again.
This document is no longer available.
```

Do not expose Sharp/Supabase internal errors directly.

---

## 71. Failure Recovery

If upload succeeds but DB insert fails:

- Remove orphaned storage objects where possible

If DB insert succeeds but processing fails:

- Keep document record
- Mark failed
- Allow retry

If optimized upload fails:

- Do not mark document ready

---

## 72. Orphan Cleanup

Prepare a maintenance strategy for:

```text
storage objects without DB rows
DB rows without storage objects
stale temporary originals
```

Full scheduled cleanup may be implemented later.

Document the repair procedure.

---

## 73. Testing Checklist

### Images

- [ ] JPEG upload works
- [ ] PNG upload works
- [ ] WebP upload works
- [ ] HEIC works if declared supported
- [ ] Unsupported type rejected
- [ ] Oversized file rejected
- [ ] Extreme dimensions rejected
- [ ] Orientation corrected
- [ ] Display WebP generated
- [ ] Thumbnail generated
- [ ] Small image not needlessly upscaled

### PDFs

- [ ] Valid PDF upload works
- [ ] Oversized PDF rejected
- [ ] Non-PDF renamed as PDF rejected where practical
- [ ] Private PDF access works

### Storage

- [ ] Files stored in private bucket
- [ ] Object path begins with user ID
- [ ] User A cannot access User B storage
- [ ] Signed URL expires
- [ ] No permanent public URL exposed

### Metadata

- [ ] Original filename stored
- [ ] Original MIME stored
- [ ] Original size stored
- [ ] Display size stored
- [ ] Thumbnail size stored
- [ ] Width/height stored
- [ ] Processing status correct
- [ ] Retention status correct

### Processing

- [ ] Sharp works locally
- [ ] Sharp works on HelloDeploy
- [ ] Failed conversion marks failed
- [ ] Retry works
- [ ] Temp files removed
- [ ] Metadata stripped from optimized output
- [ ] GPS metadata not retained in optimized WebP

### Library

- [ ] Document list works
- [ ] Thumbnail list is fast
- [ ] Document detail works
- [ ] Archive works
- [ ] Archived filter works

### RLS

- [ ] User A cannot read User B document row
- [ ] User A cannot generate signed URL for User B
- [ ] User A cannot overwrite User B storage path
- [ ] Direct anon-key INSERT into `documents` is refused by the database
- [ ] Direct anon-key UPDATE of `processing_status` is refused

### Audit

- [ ] Upload event recorded
- [ ] Processing event recorded
- [ ] Failed processing event recorded
- [ ] Archive event recorded

### Production

- [ ] Production build succeeds
- [ ] HelloDeploy supports upload size
- [ ] Sharp native runtime works
- [ ] Supabase Storage production policies work
- [ ] Signed URL generation works in production

---

## 74. Deployment Checks

Before completing Phase 04:

- [ ] `hello-pera-documents` private bucket created
- [ ] Storage policies deployed
- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] `documents` migration applied
- [ ] RLS enabled
- [ ] File limits configured
- [ ] Sharp verified on HelloDeploy
- [ ] Temporary storage verified
- [ ] Production image upload tested
- [ ] Production PDF upload tested
- [ ] Signed URL tested
- [ ] Cross-user access test passed
- [ ] No permanent file stored on HelloDeploy
- [ ] `retention_status` lifecycle verified end to end
- [ ] PDF rendering decision from §27 recorded
- [ ] `PLATFORM-HELLODEPLOY.md` rows I1, I2, Q1, R2 still pass

---

## 75. Acceptance Criteria

Phase 04 is complete only when:

1. Authenticated users can upload supported images.
2. Authenticated users can upload supported PDFs.
3. Unsupported files are rejected.
4. File size limits are enforced.
5. Image dimension limits are enforced.
6. Uploaded images are normalized.
7. Display WebP is generated.
8. Thumbnail WebP is generated.
9. Optimized files are smaller where reasonably expected.
10. Permanent files are stored in private Supabase Storage.
11. HelloDeploy is not used as permanent document storage.
12. Document metadata is stored in PostgreSQL.
13. Users can view their document library.
14. Users can open their documents using signed URLs.
15. Users cannot access another user's documents.
16. Users can archive documents.
17. Failed image processing can be retried.
18. Temporary files are cleaned up.
19. Sharp works in the HelloDeploy production environment.
20. Retention state is tracked and never deletes an unresolved extraction's source.
21. The PDF rendering approach is decided and recorded.
22. Direct client writes to `documents` are refused by the database.
23. The system is ready for OCR without redesigning the document pipeline.

---

## 76. Definition of Done

Phase 04 is considered done when:

```text
HelloPera can securely receive,
optimize,
store,
preview,
and manage financial images and PDFs
using private Supabase Storage
and WebP image processing,
while remaining ready for OCR integration.
```

The application should then be ready to begin:

```text
Phase 05 — OCR and Financial Extraction
```

Do not proceed to Phase 05 until all Phase 04 acceptance criteria pass.
