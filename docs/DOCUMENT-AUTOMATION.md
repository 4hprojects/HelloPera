# HelloPera — Document Automation: Research and Plan

Status: **research, awaiting review.** Nothing in this document is built yet.
Date: 2026-10-05.

## 1. Goal

A person uploads a photo, screenshot or PDF and HelloPera fills in everything it can:
what kind of record it is, the amount, the date, who it's from, the category and the
account. Then it asks for **one tap** to save.

The fewer fields people have to type, the more likely they are to keep using HelloPera.
The rule from `PHASE-05-OCR-EXTRACTION.md` §4 still holds: **no balance changes without
that tap.**

## 2. What we have today

### Do we use Tesseract?

No. Reading and understanding happen in one call to Claude's vision model:

| Piece | File |
|---|---|
| Provider interface | `lib/ocr/provider.ts` (`ExtractionProvider`) |
| Claude provider (model `claude-opus-5`, strict `record_extraction` tool) | `lib/ocr/claude-provider.ts` |
| Schema and validation (Zod, amounts kept as strings) | `lib/ocr/schema.ts` |
| Pipeline: rate limit → quota → job → provider → results | `services/ocr.service.ts` (`runExtraction`) |
| Duplicate scoring | `lib/ocr/duplicate.ts` |
| Review UI and save | `app/(app)/documents/[id]/review/draft-list.tsx`, `app/actions/extraction.ts` |

Phase 05 §7 ruled out Tesseract as the only reader. HelloDeploy's container has no
poppler or pdfium, so we can't turn PDF pages into images, and Tesseract reads only
images. Claude accepts PDFs directly.

### Does it categorise?

Partly. The model already returns:

- `documentType`: receipt, bill, invoice, statement, ewallet_record and others
- `suggestedTarget`: transaction, bill, receivable, expected_income or unknown
- `drafts`: one per record. A statement becomes one draft per line, up to 30.
- Per-field confidence

It does **not** link what it reads to the user's own data. The category comes back as
free text ("Food"), and the review screen starts at *No category*. The payment method
comes back as "GCash" but is never matched to the user's GCash account.

## 3. Where the user still does work

| # | Friction | Where |
|---|---|---|
| 1 | Picks *"What is it?"* before uploading, even though the model classifies anyway | `app/(app)/documents/upload-form.tsx` |
| 2 | Uploads, then presses **Read & draft** as a separate step | `app/(app)/documents/read-and-draft.tsx` |
| 3 | Picks a category for every draft; it is never prefilled | `draft-list.tsx` |
| 4 | Picks an account; one shared select covers every draft | `draft-list.tsx` |
| 5 | A monthly bill they already track (Meralco, PLDT) becomes a *new* bill | `confirmDraftsAction` |
| 6 | Uploads one file at a time | `upload-form.tsx` |

## 4. Bugs found during the review

1. **HEIC photos fail.** The provider sends the original bytes and casts `image/heic` to
   a supported type. Claude accepts only JPEG, PNG, GIF and WebP, so every iPhone HEIC
   photo comes back as an error.
2. ~~**Large photos fail or lose detail.**~~ **Fixed 2026-10-06.** Images are
   normalised with `normaliseForOcr` (rotated, at most 2576 px, JPEG q90) before
   sending. Uploads are now up to 25 MB (PDFs 20 MB) via direct-to-Storage upload, and
   that JPEG replaces the original after the first successful read.
3. **The read runs synchronously under a 60-second proxy timeout.** HelloDeploy's nginx
   cuts requests at 60 s (`PLATFORM-HELLODEPLOY.md` Q2, Phase 05 §47). A multi-page PDF
   can drop the connection while the job is still running.
4. **The model id is hardcoded.** `lib/ai/model.ts` already keeps model ids in one place
   that environment variables can override; OCR should do the same.
5. **The page limit isn't enforced.** Phase 05 §64 asks for a configurable cap of 20
   pages, checked before the paid call.

## 5. Can we do it for free?

### Options compared

| Option | Cost | PDFs | Structured fields and category | Privacy | Verdict |
|---|---|---|---|---|---|
| **Tesseract.js** (WebAssembly, runs in Node, no native deps) | Free | No, images only | No, raw text only | Stays on our server | Strong on **app screenshots**, weak on camera photos |
| **pdfjs-dist** text layer (pure JS) | Free | Digital PDFs only | No, raw text only | Stays on our server | Good for e-bills and e-statements; scanned PDFs have no text layer |
| Gemini API, free tier | Free | Yes | Yes | **Inputs may be used to improve Google's products and seen by human reviewers** | Not acceptable for financial documents |
| Azure Document Intelligence, F0 tier | 500 pages a month | First 2 pages per document only | Prebuilt receipt and invoice fields | Acceptable | One free account shared by all users, 1 request per second, intended for proofs of concept |
| Google Cloud Vision | First 1,000 units a month, then $1.50 per 1,000 | Yes | No, raw text only | Acceptable | We would still need our own categorisation |
| Claude (current) | Paid per token | Yes, natively | Yes | Not used for training | Most accurate, and the only option that does everything in one call |

On accuracy: published tests put Tesseract at about 95% on clean scans and **about 50%
on camera-captured documents**. App screenshots (GCash, Maya, bank apps) are clean
digital text, so they behave like scans. Phone photos of thermal receipts don't.

### What Claude costs per document (estimate)

A receipt photo is roughly 2–5k image tokens, about 2k tokens of instructions and
0.5–1.5k output tokens.

| Model | Price (input / output per M tokens) | ≈ per receipt | Free plan, 30 scans | Premium, 500 scans |
|---|---|---|---|---|
| Claude Opus 5 (current) | $5 / $25 | ~$0.05 | ~$1.50 | ~$25 |
| **Claude Opus 5.5** | $4 / $20 | ~$0.04 | ~$1.20 | ~$20 |
| Claude Sonnet 5.5 | $2 / $10 | ~$0.02 | ~$0.60 | ~$10 |
| Claude Haiku 4.5 | $1 / $5 | ~$0.01 | ~$0.30 | ~$5 |

These are upper-bound estimates per user per month, assuming every scan is used. Measure
the real figures from `response.usage` on the fixture set (§8).

### Recommendation: a hybrid, with the free reader first

No single free option is private, reads PDFs, *and* understands the document. So:

**Tier 0: free and local.**
1. For digital PDFs, `pdfjs-dist` extracts the text layer.
2. For screenshots, `sharp` preprocesses the image (greyscale, normalise, sharpen) and
   `tesseract.js` reads it.
3. Rule parsers (Phase 05 §24) handle known layouts: GCash, Maya, BPI and BDO app
   receipts, and Meralco, PLDT and Converge bills.
4. Merchant memory (§6C) fills in the category and account.

If amount, date and name all parse with high confidence, the result is used as is. **No
paid call is made, and no scan is taken from the user's allowance.**

**Tier 1: Claude as the paid fallback.** It handles camera photos, faded thermal
receipts, scanned PDFs, statements, and anything Tier 0 isn't confident about. Use
`claude-opus-5-5` as the default, since it is cheaper and newer than the current Opus 5.
Make the model configurable so Sonnet 5.5 can be compared on our own test set.

**Be clear about the limit.** Tier 0 removes cost for the easy majority (screenshots and
e-bills). It doesn't replace the model for photos and statements.

## 6. Plan

The phases are ordered so each one ships value on its own.

### A. Fix and harden (small)

- Before sending an image to the provider, normalise the **retained original** with
  `sharp`: decode it (HEIC included), auto-rotate it, resize it to at most 2576 px on
  the long edge, and encode it as high-quality JPEG. Never send the display WebP
  (Phase 05 §10).
- Add an `OCR_MODEL` environment variable, defaulting to `claude-opus-5-5`, next to
  `lib/ai/model.ts`. Set `output_config.effort` explicitly (the Opus 5.5 default is
  `medium`). Turn on the API's server-side refusal fallback.
- Refuse PDFs above the page cap before calling the provider.

### B. Read on upload (removes friction 1, 2 and 6)

- Remove the *"What is it?"* select. `document_type` starts as `other` and is set from
  the extraction's `documentType`.
- After an upload succeeds, start reading in the background with Next's `after()`. The
  upload returns immediately. The list shows **Reading… → Ready to review** by polling
  the existing `ocr_jobs` status. This also fixes bug 3.
- If the user has no scans left, the upload still succeeds and shows the existing
  Phase 09 §33 message ("you can still add this manually").
- Accept several files in one upload.

### C. Prefill from the user's own data (removes friction 3 and 4)

- Send the user's categories (id, name, type) and accounts (id, name, kind) with the
  document. The model returns `categoryId` and `accountId` in each draft. The server
  checks that both belong to the user; an id that doesn't becomes empty.
- **Merchant memory (deterministic and free).** When a normalised merchant name matches
  the user's last confirmed transaction with that merchant, reuse that transaction's
  category and account. This overrides the model.

  This is the honest version of "HelloPera learns": rules built from the user's own
  history, not model training (Phase 05 §66–68).
- Each draft gets its own account field, prefilled, instead of one shared select.

### D. One-tap review

- A draft that is confident, complete and not a possible duplicate shows as one line,
  *Jollibee · ₱850 · Food · GCash*, with a **Save** button.
- Only drafts that are flagged, incomplete, or possible duplicates open into the full
  form.
- A **Save all ready (n)** button sits at the top.
- `confirmDraftsAction` stays the only path that writes a record.

### E. Match existing bills (removes friction 5)

- When a bill draft matches an open bill by provider and amount, offer **Link to your
  existing Meralco bill** instead of creating a new one.
- When a payment receipt matches an open bill, offer **Mark paid**, which goes through
  `allocatePayment` in `services/obligation.service.ts`.

### F. Free Tier 0 reader (measure before enabling)

- Add `tesseract.js` and `pdfjs-dist`.
- Add a `LocalExtractionProvider` that implements `ExtractionProvider`, with rule
  parsers in `lib/ocr/parsers/`.
- Add a composite provider that tries local first and falls back to Claude.
- Usage counts only when Claude is called (Phase 05 §60). Each result row already
  records its `provider`.
- Before turning it on in production, confirm on HelloDeploy that the WebAssembly bundle
  and language data fit the container, and that CPU time per page is acceptable.

## 7. What stays the same

- Nothing changes a balance without a person's tap (Phase 05 §4).
- Duplicates are flagged and start unticked; they are never merged automatically.
- Logs never contain raw OCR text, account numbers or reference numbers (Phase 05 §58).
- Provider and model changes are recorded on every row (Phase 05 §8, §65).

## 8. How we'll know it works

- **Fixture set:** 20–30 anonymised Philippine documents, covering GCash and Maya
  screenshots, camera receipts (including a faded thermal one), a HEIC photo, a Meralco
  PDF, a multi-page bank statement and a payslip.
- **Accuracy script:** for each provider and model, measure field accuracy (amount,
  date, name, category, account) and cost per document from `response.usage`.
- **Unit tests:** extend `lib/ocr/extraction.test.ts` to cover image normalisation, id
  validation, merchant memory and the rule parsers.
- **Checks:** `npm run typecheck && npm run lint && npm test`.
- **Manual check in the running app:** upload a HEIC photo, a screenshot and a
  multi-page PDF, then confirm:
  - reading starts on its own;
  - the category and account are prefilled;
  - one tap saves;
  - no balance changes before the tap;
  - the scan counter moves only when Claude is called.

**Success target:** a clear GCash or Maya screenshot, or a known bill, goes from upload
to saved with **one tap and no typing**.

## Sources

- Azure Document Intelligence pricing and F0 limits: [aiproductivity.ai](https://aiproductivity.ai/pricing/azure-document-intelligence/), [parsli.co](https://parsli.co/compare/azure-document-intelligence)
- Gemini free-tier data use: [ampm-aiops.com](https://ampm-aiops.com/en/guides/gemini-free-tier-data-tradeoff-2026/), [cloudzero.com](https://www.cloudzero.com/blog/gemini-pricing/)
- Google Cloud Vision pricing: [cloud.google.com/vision/pricing](https://cloud.google.com/vision/pricing)
- Tesseract accuracy on camera-captured versus scanned documents: [arXiv 1605.01189](https://arxiv.org/pdf/1605.01189); Tesseract.js overview: [dev.to](https://dev.to/helloashish99/ocr-in-the-browser-how-tesseractjs-makes-pdf-text-extraction-free-5ab2)
- Claude models, pricing and vision limits: Anthropic API reference (model table cached 2026-09-25)
