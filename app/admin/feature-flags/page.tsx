import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/card';
import { AdminForm } from '@/components/admin/admin-form';
import { StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { listFlags } from '@/services/admin.service';
import { setFlagAction } from '@/app/actions/admin';

export const metadata: Metadata = { title: 'Feature flags · Admin' };

/**
 * /admin/feature-flags — PHASE-13 §33 to §36.
 *
 * The first write path this table has ever had. Until now `feature_flags` had
 * a reader (`isFlagEnabled`) and no way to change a value except the SQL
 * editor — which is precisely what criterion 22 says must not be required for
 * a routine task.
 *
 * §36 — these are kill switches. Every change is confirmed and audited in both
 * directions, because turning advertising back on by accident is as bad as
 * turning it off by accident.
 */
export default async function AdminFlagsPage() {
  await requireAdmin();
  const flags = await listFlags();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Feature flags"
        description="System-wide switches. These are not per-user entitlements."
      />

      {flags.length === 0 ? (
        <p className="hp-body text-text-muted">
          No flags found. The Phase 09 migration seeds them.
        </p>
      ) : (
        flags.map((flag) => (
          <SectionCard key={flag.key} title={flag.key} className="mb-3">
            <p className="hp-small mb-2 text-text-muted">
              Currently <StatusText value={flag.enabled ? 'on' : 'off'} /> · changed{' '}
              {new Date(flag.updatedAt).toLocaleString()}
              {typeof flag.config.note === 'string' ? ` · ${flag.config.note}` : ''}
            </p>
            <AdminForm
              action={setFlagAction}
              hidden={{ key: flag.key, enabled: String(!flag.enabled) }}
              submitLabel={flag.enabled ? 'Turn off' : 'Turn on'}
              destructive
            />
          </SectionCard>
        ))
      )}
    </div>
  );
}
