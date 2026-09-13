# HelloPera — Phase 05: OCR and Financial Extraction

## 1. Objective

Build HelloPera's OCR and financial-document extraction pipeline.

At the end of this phase, an authenticated user should be able to:

- Select or upload a financial document
- Run OCR through a replaceable OCR provider
- Store raw OCR output
- Extract structured financial fields
- Validate extracted data
- Review extracted fields
- Edit incorrect values
- Confirm extracted data
- Discard extraction results
- Create or link a financial record from confirmed extraction
- View extraction confidence
- Retry failed OCR jobs
- Preserve traceability from document to OCR result to confirmed financial record
- Avoid automatic balance changes before user confirmation
- Detect possible duplicates at a basic level

This phase creates HelloPera's core document-intelligence capability.

---

## 2. Dependencies

Phase 05 requires Phase 04 to be complete.

Required prior capabilities:

- Private document storage
- Image uploads
- PDF uploads
- WebP generation
- Thumbnail generation
- Document metadata
- Signed URLs
- Sharp working on HelloDeploy
- Financial accounts
- Transactions
- Bills
- Receivables
- Expected income
- Audit logging
- RLS

---

## 3. Scope

### Included

- OCR provider abstraction
- First OCR provider implementation
- OCR job lifecycle
- Raw OCR text storage
- OCR confidence where available
- Financial field extraction
- Document-type classification
- Structured extraction schema
- Field-level confidence
- User review screen
- Confirm
- Edit
- Discard
- Retry
- Create transaction from extraction
- Create bill from extraction
- Create receivable from extraction where appropriate
- Create expected income from extraction where appropriate
- Basic duplicate candidate detection
- Extraction audit trail
- OCR usage counting foundation
- Failure handling
- Idempotency

### Out of Scope

Do not implement yet:

- Full AI financial assistant
- Advanced semantic search
- Bank API syncing
- Automated statement reconciliation
- Automatic receipt itemization unless easy
- Self-trained OCR model
- OCR model fine-tuning
- Full queue/worker infrastructure unless required
- Premium quota enforcement
- Production subscription billing
- Complex duplicate auto-merge
- Automatic transaction confirmation without user review

---

## 4. Core Principle

OCR is not authoritative.

HelloPera must enforce:

```text
Document
↓
OCR
↓
Extraction
↓
User Review
↓
Confirmation
↓
Financial Record
```

Do not allow:

```text
OCR
↓
Automatic Balance Change
```

without user confirmation.

---

## 5. OCR vs Financial Extraction

Keep these responsibilities separate.

### OCR

Answers:

```text
What text is visible?
```

### Financial Extraction

Answers:

```text
What financial information does this text represent?
```

Example OCR:

```text
MERALCO
TOTAL AMOUNT DUE 2845.31
DUE DATE SEP 18 2026
ACCOUNT NO 123456789
```

Financial extraction:

```json
{
  "documentType": "bill",
  "provider": "MERALCO",
  "amount": 2845.31,
  "currency": "PHP",
  "dueDate": "2026-09-18",
  "accountNumber": "123456789"
}
```

---

## 6. OCR Provider Abstraction

Define a provider interface.

Conceptual TypeScript:

```ts
interface OCRProvider {
  extract(input: OCRInput): Promise<OCRProviderResult>
}
```

Possible provider result:

```ts
type OCRProviderResult = {
  rawText: string
  confidence?: number
  pages?: OCRPageResult[]
  providerMetadata?: Record<string, unknown>
}
```

HelloPera business logic must not depend directly on one provider.

---

## 7. Potential Providers

Possible implementations:

```text
Tesseract
Google Vision
AWS Textract
Azure Vision
Vision-capable AI provider
```

Phase 05 should implement only one primary provider first, kept replaceable
behind the interface above.

### Native PDF Input Is a Hard Requirement

HelloDeploy's container image cannot include poppler or pdfium, so HelloPera
cannot rasterise PDF pages itself (`PHASE-04` §27,
`PLATFORM-HELLODEPLOY.md` row I3).

```text
The selected provider must accept a PDF directly.
```

Tesseract alone does not satisfy this. Google Vision, AWS Textract and Azure
Vision do. Weigh that alongside accuracy on Philippine receipts, cost per
page, and the retention/training controls §56 requires you to document.

---

## 8. Provider Selection Strategy

Recommended initial approach:

- Use one provider as default.
- Keep provider identifier in database.
- Keep provider implementation behind service interface.
- Avoid provider-specific fields in core business tables.
- Store provider metadata in JSONB if needed.

---

## 9. OCR Input

OCR should use the best available source.

Preferred image source:

```text
normalized high-quality source
```

Possible fallback:

```text
display WebP
```

Avoid low-resolution thumbnail.

For PDFs:

- Send PDF directly if provider supports it.
- Otherwise render pages to images in a controlled process.

---

## 10. Original Retention Integration

Phase 04 §26 retains the OCR-quality source and tracks `retention_status`.
Phase 05 owns the trigger that ends that retention.

```text
Original Upload
↓
OCR completed
↓
Extraction reaches confirmed OR discarded   ← the trigger
↓
Configurable retention timer starts
↓
Delete original; set retention_status = original_deleted
↓
Keep display.webp + thumb.webp
```

### The Trigger Is Resolution, Not Completion

OCR finishing is not the end of the document's life. After it, §43 lets the
user re-run OCR, `PHASE-13` §27 lets an admin retry a failed job, and a
provider change can make old results worth regenerating.

An extraction sitting at `pending_review` for three months still holds its
source. Only `confirmed` or `discarded` starts the clock.

### Retry Must Check Retention

Every retry path — user, admin, provider migration — reads
`retention_status` first:

```text
original_retained / original_temporary
    → retry against the full-quality source

optimized_only / original_deleted
    → refuse, with a clear message
```

Do not silently fall back to `display.webp`. It is 1800px at quality 85,
compressed for viewing rather than for reading small print, and §62 already
warns that compression damages text. A retry that quietly produces worse
output than the first attempt, with nothing explaining why, is worse than a
refusal.

---

## 11. OCR Jobs Table

Suggested schema:

```text
ocr_jobs

id
user_id
document_id
provider
status
attempt_count
started_at
completed_at
failed_at
error_code
error_message_safe
created_at
updated_at
```

Suggested statuses:

```text
queued
processing
completed
failed
cancelled
```

Even if Phase 05 processes synchronously, this table prepares for later background workers.

---

## 12. OCR Results Table

Suggested schema:

```text
ocr_results

id
user_id
document_id
ocr_job_id
provider
raw_text
overall_confidence
provider_metadata jsonb
created_at
```

Do not store provider secrets.

---

## 13. Extraction Results Table

Suggested schema:

```text
extraction_results

id
user_id
document_id
ocr_result_id
document_type
status
structured_data jsonb
field_confidence jsonb
validation_errors jsonb
created_at
updated_at
```

Suggested statuses:

```text
pending_review
confirmed
discarded
failed
```

---

## 14. Structured Extraction Schema

Normalize common fields.

Potential fields:

```text
documentType
merchantName
providerName
amount
currencyCode
transactionDate
dueDate
referenceNumber
accountNumber
paymentMethod
categorySuggestion
description
sourceAccountHint
destinationAccountHint
partyName
expectedDate
```

Not all fields apply to every document.

Use nullable/optional fields.

---

## 15. Document Types

Suggested extracted types:

```text
receipt
expense_confirmation
income_confirmation
transfer_confirmation
bill
invoice
bank_record
ewallet_record
statement
salary_record
receivable_evidence
unknown
```

Avoid overconfident classification.

`unknown` is acceptable.

---

## 16. Financial Record Target

Extraction may suggest a target entity:

```text
transaction
bill
receivable
expected_income
unknown
```

Example:

```text
Meralco bill
→ bill
```

```text
GCash merchant payment screenshot
→ transaction
```

```text
Client invoice
→ receivable
```

```text
Salary advice
→ expected_income or income transaction depending evidence
```

The user must confirm the target.

---

## 17. Validation

Use Zod or equivalent runtime schema validation.

Validation should check:

```text
amount is valid decimal
currency is valid
dates parse safely
document type is allowed
reference fields are strings
confidence values are within 0–1 or defined scale
```

Invalid AI/provider output must never be trusted.

---

## 18. Field-Level Confidence

Store field confidence where possible.

Example:

```json
{
  "amount": 0.99,
  "transactionDate": 0.91,
  "merchantName": 0.84,
  "paymentMethod": 0.67
}
```

If provider does not supply field confidence:

- derive conservatively
- mark as unknown
- do not invent precise certainty

---

## 19. Confidence Presentation

UI example:

```text
Amount
₱1,245.50
99%

Date
Sep 12, 2026
91%

Payment Method
GCash
67%
Review recommended
```

Use confidence to guide review, not to bypass review.

---

## 20. Low-Confidence Threshold

Configurable.

Suggested initial threshold:

```text
0.80
```

Below threshold:

- visually highlight
- request review

Do not hardcode in many components.

---

## 21. Financial Parser

Create:

```text
services/extraction.service.ts
```

Responsibilities:

- Accept OCR text
- Identify likely document type
- Extract structured fields
- Normalize values
- Validate
- Produce confidence map
- Suggest target record type

Do not create financial records directly.

---

## 22. AI-Assisted Extraction

AI may be used after OCR.

Flow:

```text
OCR Text
↓
Prompted Structured Extraction
↓
Structured JSON
↓
Zod Validation
↓
Review
```

Keep AI behind an abstraction.

Do not let prompt output directly update database balances.

---

## 23. Extraction Provider Abstraction

Optional but recommended:

```ts
interface FinancialExtractionProvider {
  extract(input: FinancialExtractionInput): Promise<ExtractionResult>
}
```

Potential implementations:

```text
Rules/regex parser
LLM parser
Hybrid parser
```

Hybrid is a strong long-term direction.

---

## 24. Rules First Where Reliable

Use deterministic parsing for obvious patterns where practical:

```text
TOTAL
AMOUNT DUE
DUE DATE
REFERENCE NO
GCASH
MAYA
```

AI should not replace reliable deterministic parsing unnecessarily.

---

## 25. Locale Parsing

HelloPera should handle Philippine formats.

Examples:

```text
₱1,234.56
PHP 1,234.56
1,234.56
12/09/2026
Sep 12, 2026
September 12, 2026
```

Be careful with ambiguous numeric dates.

Prefer contextual parsing and user confirmation.

---

## 26. Currency Detection

Default assumption may be:

```text
PHP
```

only when:

- no currency is detected
- user profile/default is PHP
- document context supports it

Mark inferred currency clearly.

Do not silently assume PHP in all future multi-currency cases.

---

## 27. Payment Method Detection

Possible hints:

```text
GCash
Maya
Cash
Bank
Credit Card
Debit Card
PayPal
```

Detected payment method is only a hint.

User still chooses actual HelloPera account.

---

## 28. Account Matching

Extraction may suggest account.

Example:

```text
"GCash"
```

could suggest the user's GCash account.

Do not auto-select if multiple matching accounts exist.

Use:

```text
account suggestion
```

not authoritative binding.

---

## 29. Category Suggestion

Extraction may suggest:

```text
Food
Utilities
Transportation
Shopping
```

Category suggestion should be editable.

Do not create new custom categories automatically from OCR.

---

## 30. Review Screen

Route:

```text
/documents/[id]/review
```

Show:

- Document preview
- OCR status
- Suggested document type
- Target financial record type
- Extracted fields
- Confidence
- Validation warnings
- Possible duplicates
- Confirm
- Edit
- Discard

---

## 31. Side-by-Side Review

Desktop:

```text
Document Preview | Extracted Fields
```

Mobile:

```text
Preview
↓
Fields
```

Allow easy switching between image and form.

---

## 32. Review Actions

### Confirm

Creates or links selected financial record.

### Edit

Updates extraction draft, then confirm.

### Discard

Marks extraction:

```text
discarded
```

Document remains in library.

---

## 33. Confirmation Rule

Confirmation should be atomic.

Example:

```text
Validate extraction
↓
Create transaction/bill/etc
↓
Link document
↓
Mark extraction confirmed
↓
Write audit log
```

If record creation fails:

- extraction remains pending_review
- do not mark confirmed

---

## 34. Document Linking

Create a generic link table.

Suggested:

```text
document_links

id
user_id
document_id
entity_type
entity_id
created_at
```

Possible `entity_type`:

```text
transaction
bill
receivable
expected_income
```

This enables:

```text
one document → multiple records
```

and later:

```text
multiple documents → one record
```

---

## 35. Creating Expense Transaction from Extraction

Example:

```text
GCash screenshot
Amount: ₱850
Merchant: Jollibee
Date: Sep 12
```

User confirms:

```text
Target: Expense
Account: GCash
Category: Food
```

Then:

- create confirmed expense transaction
- link document
- mark extraction confirmed
- audit

---

## 36. Creating Income Transaction

Example:

```text
Payment received
₱5,000
```

User confirms:

- destination account
- category
- date

Then create income transaction.

---

## 37. Creating Transfer Transaction

If extraction indicates:

```text
BPI → GCash
```

user confirms:

- source account
- destination account

Then create transfer.

Do not treat transfer as income/expense.

---

## 38. Creating Bill

Example:

```text
PLDT
Amount Due ₱1,899
Due Sep 20
```

User confirms:

- provider
- amount
- due date
- category

Then create bill.

No expense transaction occurs until payment.

---

## 39. Creating Receivable

Example:

```text
Invoice
Client ABC
₱15,000
Due Sep 30
```

User confirms:

- party
- amount
- due date

Then create receivable.

No income transaction occurs yet.

---

## 40. Creating Expected Income

Example:

```text
Salary advice
Expected ₱30,000
Sep 15
```

User may choose:

```text
Expected Income
```

Then create expected income.

If document proves money already arrived, user should choose income transaction instead.

---

## 41. Unknown Extraction

If extraction is uncertain:

```text
Target = unknown
```

User can manually choose:

- Expense
- Income
- Transfer
- Bill
- Receivable
- Expected Income
- Keep Document Only

This is preferable to incorrect automation.

---

## 42. Raw OCR Display

Provide optional expandable section:

```text
View extracted text
```

Useful for debugging and user trust.

Do not overwhelm default UI.

---

## 43. OCR Retry

Allow:

```text
Retry OCR
```

if:

- job failed
- user wants reprocessing
- provider changed later

Retry first checks `retention_status` (§10). If the OCR-quality source has
been deleted, refuse rather than degrade:

```text
The original image for this document is no longer stored,
so it cannot be processed again.
```

Retain prior result history if practical.

---

## 44. OCR Attempt Limits

Prevent endless retries.

Set configurable technical limit.

Example:

```text
3 automatic attempts
```

Manual retry may still be allowed.

Premium usage limits belong later.

---

## 45. OCR Job Idempotency

Avoid duplicate jobs for same document while one is active.

Rule:

```text
one active OCR job per document/provider
```

unless explicitly forced.

---

## 46. Processing Flow

Suggested:

```text
Document Ready
↓
Create OCR Job
↓
status = processing
↓
Run OCR
↓
Store OCR Result
↓
Run Financial Extraction
↓
Store Extraction Result
↓
status = pending_review
```

---

## 47. Background Processing

### Go Asynchronous From the Start

HelloDeploy's nginx sets `proxy_read_timeout 60s`
(`PLATFORM-HELLODEPLOY.md`, row Q2). Sixty seconds covers the upload, the
provider round trip, extraction and the response.

A single clear receipt fits comfortably. A multi-page PDF will not — and the
failure mode is a dropped connection with the job state unknown to the user.

Since `ocr_jobs` (§11) and the polling UI (§48) are already in the design,
asynchronous processing costs little now. The synchronous shortcut expires
the first time someone uploads something large, and rewriting it then means
touching the review flow that was built on top of it.

Long-running operations should be designed to migrate later to:

```text
Redis + BullMQ
```

Do not tightly couple UI request lifetime to provider architecture.

---

## 48. Polling / Status UI

If OCR is asynchronous:

UI may poll:

```text
queued
processing
completed
failed
```

Future realtime may use Supabase Realtime if useful.

---

## 49. Duplicate Detection Foundation

Before confirming a new financial record, look for likely duplicates.

Signals:

```text
amount
date
merchant/provider
reference number
account hint
document hash
```

Return:

```text
possible_duplicate = true
```

with candidates.

---

## 50. Duplicate Candidate Table

Optional suggested table:

```text
duplicate_candidates

id
user_id
document_id
candidate_entity_type
candidate_entity_id
score
reasons jsonb
status
created_at
```

This may be deferred if service-level calculation is enough.

---

## 51. Duplicate Scoring

Example weighted signals:

```text
Exact reference number      high weight
Exact amount                medium/high
Same date                   medium
Same merchant               medium
Same account                low/medium
Same document hash          very high
```

Do not auto-merge.

---

## 52. Duplicate Review

Show:

```text
Possible existing transaction

₱1,250
Sep 12
Jollibee
GCash
```

Actions:

```text
Link to existing
Create new anyway
Review
```

---

## 53. Link to Existing Record

If document represents an already-recorded transaction:

Do not create duplicate transaction.

Instead:

```text
link document
↓
mark extraction confirmed
```

Audit the decision.

---

## 54. Statement Handling

Phase 05 may OCR statements, but should not automatically create many transactions from one statement unless explicitly designed.

For MVP:

- OCR text can be stored
- extraction may classify statement
- user may keep document only

Bulk statement parsing belongs later.

---

## 55. Receipt Itemization

Item-level extraction is optional.

If included:

```text
line_items jsonb
```

Do not make Phase 05 completion depend on perfect itemization.

The core value is reliable top-level financial data.

---

## 56. Privacy

OCR providers may receive sensitive financial documents.

The implementation must document:

- Which provider is used
- What data is sent
- Retention behavior if known
- Whether the provider trains on submitted data
- Configuration required to minimize retention where available

Do not silently change providers.

---

## 57. Provider Configuration

Environment variables may include:

```text
OCR_PROVIDER
OCR_API_KEY
OCR_ENDPOINT
```

AI extraction may include:

```text
EXTRACTION_PROVIDER
EXTRACTION_API_KEY
```

Keep server-only.

---

## 58. Sensitive Logging

Never log:

- Full OCR text
- Account numbers
- Reference numbers
- Full receipt content
- Provider API keys

Structured logs may include:

```text
document_id
job_id
provider
status
duration
error_code
```

---

## 59. Audit Events

Suggested:

```text
ocr_started
ocr_completed
ocr_failed
ocr_retried

extraction_created
extraction_edited
extraction_confirmed
extraction_discarded

document_linked
duplicate_candidate_found
duplicate_linked_existing
```

---

## 60. Usage Counting Foundation

Create `usage_records` now, with **exactly** the shape Phase 09 specifies:

```text
usage_records

id
user_id
feature_key          -- 'ocr_jobs' here
period_start
period_end
quantity
updated_at

unique (user_id, feature_key, period_start)
```

Phase 05 writes to it; Phase 09 adds entitlement resolution and enforcement
on top. No schema change between the two.

Building a "temporary lightweight log" here would mean writing the counting
logic twice and migrating historical usage into the real table during the
phase that introduces billing — the worst possible moment to discover the
counts disagree.

### Counting Rule

Increment when the provider is actually invoked, since that is what costs
money:

```text
Request rejected before the provider call   → not counted
Provider invoked, any outcome               → counted once
HelloPera-caused retry of the same job      → not counted again
User-initiated re-run                       → counted
```

Period boundaries use calendar months in the user's timezone
(`profiles.timezone`). Phase 09 §17 restates this rule as the single
authority; keep the two consistent.

Track provider attempts separately from user quota if the distinction
matters for cost analysis.

---

## 61. Cost Awareness

Store provider and job timing.

Possible metrics:

```text
provider
pages
duration_ms
estimated_cost optional
```

Do not expose cost estimation to users unless later useful.

---

## 62. OCR on Images

Preferred:

- high-quality normalized image
- not thumbnail

Ensure WebP compression has not damaged text.

Test:

- screenshots
- camera receipts
- low-light receipts
- small text
- rotated images

---

## 63. OCR on PDFs

If provider supports PDF natively:

Use PDF.

If not:

```text
PDF
↓
Render pages safely
↓
OCR each page
↓
Combine results
```

Page limits should be configurable.

---

## 64. PDF Page Limit

Protect costs.

Suggested technical initial limit:

```text
20 pages
```

Exact value configurable.

Premium limits come later.

---

## 65. OCR Confidence Caveat

Provider confidence values are not directly comparable across providers.

Store:

```text
provider
confidence
```

Do not assume 0.90 from one provider equals 0.90 from another.

---

## 66. User Corrections

When user edits extracted fields:

Store corrected value.

Optional:

```text
original_extracted_data
corrected_data
```

This becomes valuable later for:

- parser improvement
- rule tuning
- accuracy analysis

Do not claim the OCR model automatically learns from corrections unless an explicit training system is built.

---

## 67. Correction Dataset Foundation

Optional table:

```text
extraction_corrections

id
user_id
extraction_result_id
field_name
original_value
corrected_value
created_at
```

If stored, treat carefully because it may contain sensitive data.

Can be deferred.

---

## 68. Learning Policy

Phase 05 does not train a custom OCR model.

HelloPera may improve by:

- refining rules
- improving prompts
- improving field matching
- tuning provider selection
- analyzing anonymized/error patterns later

Do not represent corrections as automatic model training.

---

## 69. User Review UX

Prioritize important fields:

```text
Amount
Date
Merchant/Provider
Account
Category
Due Date
Reference
```

Low-value metadata can remain secondary.

---

## 70. Mandatory Confirmation Fields by Target

### Expense

```text
Amount
Date
Account
Category
```

### Income

```text
Amount
Date
Destination Account
Category
```

### Transfer

```text
Amount
Date
Source Account
Destination Account
```

### Bill

```text
Provider
Amount
Due Date
Category
```

### Receivable

```text
Party
Amount
Due Date
```

### Expected Income

```text
Source
Amount
Expected Date
```

---

## 71. Validation Before Confirmation

Before creating financial record:

- Confirm user owns document
- Validate target schema
- Validate accounts/categories
- Check currencies
- Check duplicate candidates
- Check extraction status
- Ensure no prior confirmed target unless intentional

---

## 72. One Extraction, Multiple Records

Some documents may represent more than one financial concept.

Example:

```text
Bill + payment confirmation in one screenshot
```

Phase 05 may keep one primary target only.

Multiple-target extraction can be added later.

Do not overcomplicate MVP.

---

## 73. Existing Record Link

Allow:

```text
Attach this document to an existing record
```

Useful when user manually recorded transaction first.

Possible target search:

- transactions
- bills
- receivables
- expected income

---

## 74. Document Detail Integration

Update:

```text
/documents/[id]
```

to show:

- OCR status
- Extraction status
- Review button
- Raw text link
- Linked financial records

---

## 75. Search Enhancement

After OCR, document search may use:

```text
merchant/provider
reference
document type
```

Full raw OCR text search can be deferred if privacy/performance concerns exist.

---

## 76. RLS Requirements

Enable RLS on:

```text
ocr_jobs
ocr_results
extraction_results
document_links
```

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

Job and extraction state transitions are owned exclusively by services.

This matters especially here: a client able to set
`extraction_results.status = confirmed` could bypass the review step that
§4 exists to enforce — the one rule that keeps OCR output from reaching a
balance unreviewed.

`usage_records` is likewise service-write-only. A client able to decrement
its own usage would make Phase 09's quotas decorative.

---

## 77. Service Role Usage

If provider jobs require server service role:

- Keep key server-only
- Verify authenticated user
- Verify document ownership
- Limit operation scope

Do not bypass RLS without explicit ownership validation.

---

## 78. Suggested Services

```text
services/
  ocr.service.ts
  ocr-provider.service.ts
  extraction.service.ts
  extraction-confirmation.service.ts
  duplicate-detection.service.ts
  document-link.service.ts
```

Reuse:

```text
transaction.service.ts
bill.service.ts
receivable.service.ts
expected-income.service.ts
audit.service.ts
```

---

## 79. Data Access

No repository layer — see `PHASE-02` §39. Services own their queries.

Financial records created on confirmation route through the Phase 02 and
Phase 03 services, including the allocation function in `PHASE-03` §37 when
an extraction settles an obligation.

---

## 80. Suggested Schemas

```text
schemas/
  ocr-job.schema.ts
  extraction-result.schema.ts
  extraction-confirmation.schema.ts
  extracted-transaction.schema.ts
  extracted-bill.schema.ts
  extracted-receivable.schema.ts
  extracted-expected-income.schema.ts
```

---

## 81. Error Handling

User-facing examples:

```text
We could not read this document.
OCR processing failed.
Some fields need your review.
The amount could not be detected.
The document appears to duplicate an existing transaction.
This extraction has already been confirmed.
The selected account is unavailable.
```

Do not expose provider raw errors.

---

## 82. Failure Recovery

If OCR fails:

- mark job failed
- preserve document
- allow retry

If extraction fails after OCR succeeds:

- preserve OCR result
- allow rerun extraction

If confirmation fails:

- keep extraction pending_review
- do not create partial financial record

---

## 83. Idempotent Confirmation

Prevent double-confirm.

Use transactional check:

```text
extraction status must be pending_review
```

Then atomically:

```text
create target record
link document
mark confirmed
audit
```

Repeated request should not create duplicates.

---

## 84. Concurrency

Two simultaneous confirm requests must not create two financial records.

Use:

- database transaction
- unique confirmation token
- status transition locking
- unique link constraint where useful

---

## 85. Performance

Track:

```text
OCR duration
Extraction duration
Total processing duration
```

Do not block UI unnecessarily.

If processing becomes slow, Phase 08 can introduce queue workers earlier if required.

---

## 86. UI Statuses

Document OCR status:

```text
Not Processed
Queued
Processing
Ready for Review
Confirmed
Failed
Discarded
```

Use text + icon, not color only.

---

## 87. Accessibility

Review screen should support:

- Proper labels
- Keyboard navigation
- Clear focus order
- Error summary
- Confidence described in text
- Preview zoom controls
- Non-color-only warnings

---

## 88. Mobile UX

On mobile:

- Preview should be collapsible
- Important fields first
- Large confirm button
- Easy account/category selection
- Avoid excessive scrolling where possible
- Sticky action footer is acceptable

---

## 89. Desktop UX

Use split view where practical:

```text
Preview
|
Structured Fields
```

Keep amount/date/provider visible without scrolling.

---

## 90. Testing Checklist

### OCR Jobs

- [ ] OCR job created
- [ ] OCR status transitions correctly
- [ ] Raw OCR text stored
- [ ] Failed OCR handled
- [ ] Retry works
- [ ] Duplicate active job prevented

### Images

- [ ] Receipt photo OCR works
- [ ] Screenshot OCR works
- [ ] Rotated image OCR works
- [ ] Small text tested
- [ ] Low-quality image fails gracefully

### PDFs

- [ ] Supported PDF OCR works
- [ ] Page limit enforced
- [ ] Multi-page result stored correctly
- [ ] Unsupported PDF handled

### Extraction

- [ ] Amount extracted
- [ ] Date extracted
- [ ] Merchant/provider extracted
- [ ] Due date extracted when present
- [ ] Reference extracted when present
- [ ] Currency normalized
- [ ] Document type classified
- [ ] Unknown classification supported

### Validation

- [ ] Invalid provider JSON rejected
- [ ] Invalid amount rejected
- [ ] Invalid date handled
- [ ] Missing required confirmation fields blocked

### Confidence

- [ ] Field confidence stored
- [ ] Low confidence highlighted
- [ ] Missing confidence handled

### Review

- [ ] User can edit fields
- [ ] User can confirm
- [ ] User can discard
- [ ] Raw OCR can be viewed
- [ ] Document preview remains accessible

### Financial Creation

- [ ] Expense created correctly
- [ ] Income created correctly
- [ ] Transfer created correctly
- [ ] Bill created correctly
- [ ] Receivable created correctly
- [ ] Expected income created correctly
- [ ] Account balances only change after confirmation

### Duplicate Detection

- [ ] Exact reference match found
- [ ] Same amount/date candidate found
- [ ] User can link to existing record
- [ ] User can create new anyway
- [ ] No automatic destructive merge

### Idempotency

- [ ] Double confirm does not create duplicates
- [ ] Retry does not duplicate OCR result unexpectedly
- [ ] Existing linked record remains stable

### Retention

- [ ] Source retained while extraction is pending_review
- [ ] Retention timer starts only at confirmed or discarded
- [ ] Retry refuses cleanly when the source has been deleted
- [ ] Retry never silently falls back to the display WebP

### RLS

- [ ] User A cannot access User B OCR job
- [ ] User A cannot access User B OCR text
- [ ] User A cannot confirm User B extraction
- [ ] User A cannot link User B document
- [ ] Direct anon-key UPDATE of `extraction_results.status` is refused
- [ ] Direct anon-key UPDATE of `usage_records` is refused

### Privacy

- [ ] OCR secrets not exposed
- [ ] Raw OCR not written to application logs
- [ ] Provider configuration documented
- [ ] Signed document access still enforced

### Production

- [ ] OCR works through HelloDeploy
- [ ] Provider API reachable from production
- [ ] Production secrets configured
- [ ] Timeouts handled
- [ ] Production confirmation flow works

---

## 91. Deployment Checks

Before completing Phase 05:

- [ ] OCR provider selected and documented
- [ ] Provider credentials configured server-side
- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] OCR migrations applied
- [ ] Extraction migrations applied
- [ ] RLS enabled
- [ ] Document link table deployed
- [ ] Production OCR tested
- [ ] Production PDF OCR tested if supported
- [ ] User review tested
- [ ] Financial record confirmation tested
- [ ] Duplicate detection tested
- [ ] Double-confirm protection tested
- [ ] Provider failure path tested
- [ ] Raw OCR not exposed in logs

---

## 92. Acceptance Criteria

Phase 05 is complete only when:

1. Users can run OCR on their own documents.
2. OCR provider is abstracted.
3. Raw OCR text is stored securely.
4. Structured financial data is extracted.
5. Extraction output is schema validated.
6. Field confidence is stored where available.
7. Users can review extracted fields.
8. Users can edit extracted fields.
9. Users can discard extraction.
10. Users can confirm extraction.
11. Expense transactions can be created from confirmed extraction.
12. Income transactions can be created from confirmed extraction.
13. Transfers can be created from confirmed extraction.
14. Bills can be created from confirmed extraction.
15. Receivables can be created from confirmed extraction.
16. Expected income can be created from confirmed extraction.
17. No balance changes occur before user confirmation.
18. Documents can link to existing financial records.
19. Basic duplicate candidates are identified.
20. Duplicate candidates are never automatically destructively merged.
21. Double confirmation does not create duplicate financial records.
22. Failed OCR jobs can be retried while their source is retained.
23. Retry refuses cleanly once the source has been deleted.
24. `usage_records` exists in its final Phase 09 shape.
25. RLS protects OCR and extraction data, granting the browser SELECT only.
26. Provider secrets remain server-side.
27. HelloPera does not claim to train its own OCR model from user corrections.
28. The system is ready for dashboard and analytics integration.

---

## 93. Definition of Done

Phase 05 is considered done when:

```text
HelloPera can securely read
financial documents,
extract structured financial information,
show confidence and warnings,
let the user correct the result,
and create or link financial records
only after explicit confirmation.
```

The application should then be ready to begin:

```text
Phase 06 — Dashboard and Analytics
```

Do not proceed to Phase 06 until all Phase 05 acceptance criteria pass.
