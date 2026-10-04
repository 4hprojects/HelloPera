import { isFlagEnabled } from '@/services/plan.service';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { getDocument } from '@/services/document.service';
import {
  getExtractionForDocument,
  loadRecentForDuplicates,
} from '@/services/ocr.service';
import { listAccounts } from '@/services/account.service';
import { listCategories } from '@/services/category.service';
import { explainCandidate, findCandidates } from '@/lib/ocr/duplicate';
import { draftsFromFields } from '@/lib/ocr/schema';
import { DraftList, type DraftCardData } from './draft-list';
import { RunExtraction } from './run-extraction';

export const metadata: Metadata = { title: 'Review document' };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireUser();
  const { id } = await params;
  const ocrEnabled = await isFlagEnabled('ocr_enabled');

  const doc = await getDocument(id);
  if (!doc) notFound();

  const extraction = await getExtractionForDocument(id);
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);

  const fields = (extraction?.structured_data ?? {}) as Record<string, unknown>;
  const drafts = draftsFromFields(fields);
  const savedIndexes = new Set(
    Object.keys(
      (extraction?.corrected_data as { saved?: Record<string, unknown> } | null)?.saved ??
        {},
    ).map(Number),
  );

  // One query for recent transactions, compared against every draft.
  const recent =
    extraction && extraction.status === 'pending_review' && drafts.length > 0
      ? await loadRecentForDuplicates(profile.id)
      : [];
  const cards: DraftCardData[] = drafts.map((draft, index) => {
    const matches = findCandidates(
      {
        amount: draft.amount ?? null,
        currency: (fields.currencyCode as string | null) ?? profile.default_currency,
        date: draft.date ?? null,
        merchant: draft.name ?? null,
        reference: draft.referenceNumber ?? null,
        documentHash: doc.content_hash,
      },
      draft.target === 'transaction' ? recent : [],
    );
    return {
      draft,
      index,
      saved: savedIndexes.has(index),
      duplicates: matches.slice(0, 1).map(explainCandidate),
    };
  });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Review document"
        description="Nothing is recorded until you confirm it."
        actions={
          <Link href="/documents" className="hp-small font-medium text-primary-text">
            Back to documents
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="hp-label mb-2 text-text-muted">Document</p>
          {doc.thumbnail_size_bytes ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/documents/${doc.id}/display`}
              alt="Uploaded document"
              className="w-full rounded border border-border"
            />
          ) : (
            <p className="hp-body text-text-muted">
              {doc.original_filename ?? 'PDF document'} — no preview available.
            </p>
          )}
        </Card>

        <div>
          {!ocrEnabled && !extraction ? (
            <Card>
              <h2 className="hp-h3">Stored privately</h2>
              <p className="hp-body mt-2">
                Document reading is not enabled. Your file is saved; record its details
                manually when you are ready.
              </p>
              <Link
                className="inline-flex min-h-11 items-center text-primary-text underline"
                href="/transactions/new"
              >
                Add a transaction
              </Link>
            </Card>
          ) : !extraction ? (
            <Card>
              <p className="hp-h3 text-text">Not read yet</p>
              <p className="hp-body mb-4 mt-1 text-text-muted">
                Read this document to pull out the amount, date and merchant. You will
                review everything before anything is saved.
              </p>
              <RunExtraction documentId={doc.id} />
            </Card>
          ) : extraction.status === 'confirmed' ? (
            <Card>
              <p className="hp-h3 text-success-text">Already confirmed</p>
              <p className="hp-body mt-1 text-text-muted">
                This document has been turned into a record and is linked to it.
              </p>
            </Card>
          ) : extraction.status === 'discarded' ? (
            <Card>
              <p className="hp-h3 text-text">Discarded</p>
              <p className="hp-body mb-4 mt-1 text-text-muted">
                The extracted details were discarded. The document is still in your
                library.
              </p>
              {ocrEnabled && <RunExtraction documentId={doc.id} label="Read it again" />}
            </Card>
          ) : drafts.length === 0 ? (
            <Card>
              <p className="hp-h3 text-text">Nothing to record found</p>
              <p className="hp-body mb-4 mt-1 text-text-muted">
                The reader could not turn this document into a record. You can add one by
                hand, or read it again if the photo was unclear.
              </p>
              <Link
                className="inline-flex min-h-11 items-center text-primary-text underline"
                href="/transactions/new"
              >
                Add a transaction
              </Link>
              {ocrEnabled && (
                <div className="mt-3">
                  <RunExtraction documentId={doc.id} label="Read it again" />
                </div>
              )}
            </Card>
          ) : (
            <DraftList
              extractionId={extraction.id}
              documentId={doc.id}
              cards={cards}
              currency={profile.default_currency}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
              categories={categories.map((c) => ({
                id: c.id,
                name: c.name,
                type: c.type,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
