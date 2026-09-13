import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <PageHeader title="Terms" />
      <p className="hp-body text-text-muted">
        This page is a placeholder. The Terms content is written in Phase 10, and must
        describe what HelloPera actually does — not what it plans to do. Publishing it
        before account deletion and data export work would make it inaccurate on its first
        day.
      </p>
    </div>
  );
}
