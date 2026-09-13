import type { Metadata } from 'next';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Features' };

/**
 * Phase 10 §14: do not promise functionality that does not exist. Each item
 * carries the phase that delivers it, so this page cannot quietly drift into
 * marketing ahead of the build.
 */
const features = [
  {
    title: 'Accounts and manual entry',
    phase: '02',
    body: 'Cash, bank, e-wallets, credit cards and loans, with transfers that never count as income or expense.',
  },
  {
    title: 'Bills and receivables',
    phase: '03',
    body: 'Track what you owe and what others owe you, including partial payments.',
  },
  {
    title: 'Document capture',
    phase: '04',
    body: 'Upload receipts and statements to private storage, optimised automatically.',
  },
  {
    title: 'OCR extraction',
    phase: '05',
    body: 'Read amounts and due dates from documents — always with your review before anything is recorded.',
  },
  {
    title: 'Dashboard and analytics',
    phase: '06',
    body: 'Balances, cash flow and spending by category and account.',
  },
  {
    title: 'Recurring and forecasting',
    phase: '07',
    body: 'Model regular income and bills, and project your balance forward.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PageHeader
        title="Features"
        description="HelloPera is built in phases. Each item below shows the phase that delivers it."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title}>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>{f.title}</CardTitle>
              <Badge tone="info">Phase {f.phase}</Badge>
            </div>
            <p className="hp-body mt-2 text-text-muted">{f.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
