import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireUser } from '@/lib/auth/guards';
import { getDocument } from '@/services/document.service';
import {
  getExtractionForDocument,
  findDuplicateCandidates,
} from '@/services/ocr.service';
import { listAccounts } from '@/services/account.service';
import { listCategories } from '@/services/category.service';
import { explainCandidate } from '@/lib/ocr/duplicate';
import { ReviewForm } from './review-form';
import { RunExtraction } from './run-extraction';

export const metadata: Metadata = { title: 'Review document' };

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireUser();
  const { id } = await params;

  const doc = await getDocument(id);
  if (!doc) notFound();

  const extraction = await getExtractionForDocument(id);
  const [accounts, categories] = await Promise.all([
    listAccounts(),
    listCategories('expense'),
  ]);

  const fields = (extraction?.structured_data ?? {}) as Record<string, string | null>;
  const confidence = (extraction?.field_confidence ?? {}) as Record<string, number>;

  const duplicates =
    extraction && extraction.status === 'pending_review'
      ? await findDuplicateCandidates({
          userId: profile.id,
          amount: fields.amount ?? null,
          currency: fields.currencyCode ?? profile.default_currency,
          date: fields.transactionDate ?? null,
          merchant: fields.merchantName ?? null,
          reference: fields.referenceNumber ?? null,
          documentHash: doc.content_hash,
        })
      : [];

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
          {!extraction ? (
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
              <RunExtraction documentId={doc.id} label="Read it again" />
            </Card>
          ) : (
            <>
              {duplicates.length > 0 ? (
                <Card className="mb-4 border-warning">
                  <p className="hp-h3 text-warning-text">
                    You may have recorded this already
                  </p>
                  <ul className="mt-2 space-y-1">
                    {duplicates.slice(0, 3).map((c) => (
                      <li key={c.id} className="hp-small text-text-muted">
                        {explainCandidate(c)}
                      </li>
                    ))}
                  </ul>
                  <p className="hp-small mt-2 text-text-muted">
                    Nothing has been merged. Confirm only if this is a separate payment.
                  </p>
                </Card>
              ) : null}

              <ReviewForm
                extractionId={extraction.id}
                documentId={doc.id}
                fields={fields}
                confidence={confidence}
                suggestedTarget={(fields.suggestedTarget as string) ?? 'unknown'}
                currency={profile.default_currency}
                accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
                categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
