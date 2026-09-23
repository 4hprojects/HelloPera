import type { Metadata } from 'next';
import { appUrl } from '@/lib/env';
import { Card, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = {
  alternates: { canonical: `${appUrl()}/features` },
  title: 'Features',
};

/**
 * Phase 10 §14: do not promise functionality that does not exist. Availability describes the free launch rather than internal development phases.
 */
const features = [
  {
    title: 'Accounts and manual entry',
    availability: 'Available',
    body: 'Cash, bank, e-wallets, credit cards and loans, with transfers that never count as income or expense.',
  },
  {
    title: 'Bills and receivables',
    availability: 'Available',
    body: 'Track what you owe and what others owe you, including partial payments.',
  },
  {
    title: 'Document capture',
    availability: 'Available',
    body: 'Upload receipts and statements to private storage, optimised automatically.',
  },
  {
    title: 'OCR extraction',
    availability: 'Coming later',
    body: 'Automatic document reading is not enabled for the free launch. You can store documents and enter transactions manually.',
  },
  {
    title: 'Dashboard and analytics',
    availability: 'Available',
    body: 'Balances, cash flow and spending by category and account.',
  },
  {
    title: 'Recurring and forecasting',
    availability: 'Available',
    body: 'Model regular income and bills, and project your balance forward.',
  },
  {
    title: 'Reminders',
    availability: 'In-app',
    body: 'Check reminders inside HelloPera for bills, late receivables, and projected shortfalls. Device push is not enabled at launch.',
  },
  {
    title: 'Your data, yours',
    availability: 'Available',
    body: 'Export everything as CSV or JSON at any time, and delete your account and its files for good.',
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PageHeader
        title="Features"
        description="Start with manual tracking, private documents, and in-app reminders. Document reading and device push will be introduced separately."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {features.map((f) => (
          <Card key={f.title}>
            <div className="flex items-start justify-between gap-3">
              <CardTitle>{f.title}</CardTitle>
              <Badge tone="info">{f.availability}</Badge>
            </div>
            <p className="hp-body mt-2 text-text-muted">{f.body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
