import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth/guards';
import { listDocuments } from '@/services/document.service';
import { Button } from '@/components/ui/button';
import { archiveDocumentAction } from '@/app/actions/documents';
import { UploadForm } from './upload-form';

export const metadata: Metadata = { title: 'Documents' };

const TYPE_LABELS: Record<string, string> = {
  receipt: 'Receipt',
  screenshot: 'Screenshot',
  bill: 'Bill',
  payment_confirmation: 'Payment confirmation',
  bank_record: 'Bank record',
  ewallet_record: 'E-wallet record',
  invoice: 'Invoice',
  statement: 'Statement',
  salary_record: 'Salary record',
  other: 'Other',
};

function formatBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireUser();
  const { type } = await searchParams;
  const initialType = type && type in TYPE_LABELS ? type : 'receipt';
  const documents = await listDocuments();

  const saved = documents.reduce((acc, d) => {
    if (!d.original_size_bytes || !d.display_size_bytes) return acc;
    return acc + (d.original_size_bytes - d.display_size_bytes);
  }, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Documents"
        description="Receipts, bills and statements. Stored privately — only you can open them."
      />

      <Card className="mb-5">
        <div id="upload">
          <UploadForm initialType={initialType} />
        </div>
      </Card>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="Upload a receipt, screenshot, bill or statement to keep your financial records organised."
        />
      ) : (
        <>
          {saved > 0 ? (
            <p className="hp-small mb-3 text-text-muted">
              {documents.length} document{documents.length === 1 ? '' : 's'} ·{' '}
              {formatBytes(saved)} saved by optimisation
            </p>
          ) : null}
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li key={doc.id}>
                <Card className="flex flex-wrap items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-surface-muted">
                    {doc.thumbnail_size_bytes ? (
                      // Thumbnail, never the full display image, in a list (§22).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/documents/${doc.id}/thumbnail`}
                        alt={`${TYPE_LABELS[doc.document_type] ?? 'Document'} preview`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="hp-label text-text-muted">PDF</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-text">
                      {doc.original_filename ??
                        TYPE_LABELS[doc.document_type] ??
                        'Document'}
                    </p>
                    <p className="hp-small text-text-muted">
                      {TYPE_LABELS[doc.document_type] ?? doc.document_type} ·{' '}
                      {doc.created_at.slice(0, 10)} ·{' '}
                      {formatBytes(doc.original_size_bytes)}
                      {doc.page_count ? ` · ${doc.page_count} pages` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {doc.processing_status === 'ready' ? (
                      <Link
                        href={`/documents/${doc.id}/review`}
                        className="hp-small font-medium text-primary-text"
                      >
                        Review
                      </Link>
                    ) : null}
                    {/* Status is stated in words, never colour alone. */}
                    {doc.processing_status === 'ready' ? (
                      <Badge tone="success">Ready</Badge>
                    ) : doc.processing_status === 'failed' ? (
                      <Badge tone="danger">Failed</Badge>
                    ) : (
                      <Badge tone="info">Processing</Badge>
                    )}
                  </div>

                  {doc.processing_status === 'failed' ? (
                    <div className="basis-full rounded border border-border bg-surface-muted p-3">
                      <p className="hp-small text-text">
                        This file could not be processed, so it is not usable yet. Nothing
                        was created from it. Upload it again — a different copy or a
                        smaller photo often works — and remove this entry once the new one
                        is ready.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3">
                        <Link
                          href={`/documents?type=${doc.document_type}#upload`}
                          className="inline-flex min-h-11 items-center text-primary-text underline"
                        >
                          Upload again as {TYPE_LABELS[doc.document_type] ?? 'document'}
                        </Link>
                        <form action={archiveDocumentAction}>
                          <input type="hidden" name="id" value={doc.id} />
                          <input type="hidden" name="archived" value="true" />
                          <Button type="submit" variant="secondary">
                            Remove failed entry
                          </Button>
                        </form>
                      </div>
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="hp-small mt-5 text-text-muted">
        PDFs show a label instead of a preview; open them from Review. Location data is
        removed from uploaded photos. Files are never public — opening one creates a link
        that expires after two minutes.
      </p>
    </div>
  );
}
