import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireAdmin } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Admin' };

/**
 * Phase 01 §49: operational placeholders only.
 *
 * Admin is operational access, not unrestricted access to user finances. That
 * boundary holds from here through Phase 13 — no balances, no transactions,
 * no receipts here by default.
 */
const PLACEHOLDERS = ['Users', 'OCR Jobs', 'System'];

export default async function AdminPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="HelloPera Admin"
        description="Operational placeholders. No user financial data is shown here, by design."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PLACEHOLDERS.map((p) => (
          <Card key={p}>
            <CardLabel>{p}</CardLabel>
            <p className="hp-amount hp-amount-lg mt-1.5 text-text-muted">—</p>
          </Card>
        ))}
      </div>
      <p className="hp-small mt-4 text-text-muted">
        <Link href="/admin/subscriptions" className="text-primary-text underline">
          Monetization
        </Link>{' '}
        is live. User management, OCR operations and system health arrive in Phase 13.
      </p>
    </div>
  );
}
