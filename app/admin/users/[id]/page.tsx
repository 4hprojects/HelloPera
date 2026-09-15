import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { SelectField, TextField } from '@/components/ui/field';
import { Card, SectionCard } from '@/components/ui/card';
import { StatusText } from '@/components/admin/data-table';
import { AdminForm } from '@/components/admin/admin-form';
import { buttonClass } from '@/components/ui/button';
import { requireAdmin } from '@/lib/auth/guards';
import { getUserDetail } from '@/services/admin.service';
import { ENTITLEMENT_KEYS } from '@/lib/monetization/entitlements';
import { METERED_FEATURES } from '@/lib/monetization/limits';
import {
  addSupportNoteAction,
  adjustUsageAction,
  grantOverrideAction,
  revokeOverrideAction,
  setUserRoleAction,
  setUserStatusAction,
} from '@/app/actions/admin';

export const metadata: Metadata = { title: 'User · Admin' };

/**
 * /admin/users/[id] — PHASE-13 §15.
 *
 * §15: *"Do not show private finance by default."* There is no "by default"
 * escape hatch here — the page has no path to one. Record counts appear because
 * "this account has 42 transactions" is an operational fact that answers "is
 * this a real user or a test signup"; which 42 is not this page's business, and
 * `getUserDetail` fetches them with `head: true` so the rows never leave the
 * database.
 */
export default async function AdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { user, plan, usage, overrides, notes, events, recordCounts } = detail;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={user.email ?? 'User'}
        description={user.fullName ?? 'No name set.'}
        actions={
          <Link href="/admin/users" className={buttonClass('ghost', 'sm')}>
            All users
          </Link>
        }
      />

      <Card className="mb-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Status">
            <StatusText value={user.status} />
          </Field>
          <Field label="Role">{user.role}</Field>
          <Field label="Plan">
            {plan ? `${plan.name}${plan.status ? ` (${plan.status})` : ''}` : 'Free'}
          </Field>
          <Field label="Joined">{new Date(user.createdAt).toLocaleDateString()}</Field>
        </dl>
        <p className="hp-small mt-3 text-text-muted">
          {recordCounts.transactions} transactions · {recordCounts.accounts} accounts ·{' '}
          {recordCounts.documents} documents. Counts only — their contents are not visible
          to admins.
        </p>
      </Card>

      <SectionCard title="Status" className="mb-4">
        {/* §11 — reactivation restores access and changes nothing else. */}
        {user.status === 'active' ? (
          <AdminForm
            action={setUserStatusAction}
            hidden={{ userId: user.id, status: 'suspended' }}
            submitLabel="Suspend"
            destructive
          />
        ) : (
          <AdminForm
            action={setUserStatusAction}
            hidden={{ userId: user.id, status: 'active' }}
            submitLabel="Reactivate"
          />
        )}
      </SectionCard>

      <SectionCard title="Role" className="mb-4">
        <AdminForm
          action={setUserRoleAction}
          hidden={{ userId: user.id, role: user.role === 'admin' ? 'user' : 'admin' }}
          submitLabel={user.role === 'admin' ? 'Remove admin' : 'Make admin'}
          destructive
        />
      </SectionCard>

      <SectionCard title="This month's usage" className="mb-4">
        {usage.length === 0 ? (
          <p className="hp-small text-text-muted">No metered usage recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {usage.map((u) => (
              <li key={u.feature} className="flex justify-between gap-3 py-2">
                <span className="hp-small text-text-muted">{u.feature}</span>
                <span className="hp-small tabular-nums text-text">{u.quantity}</span>
              </li>
            ))}
          </ul>
        )}

        {/* §23, §32 of Phase 09 — a credit is a row, not an edit to history. */}
        <div className="mt-3 border-t border-border pt-3">
          <AdminForm
            action={adjustUsageAction}
            hidden={{ userId: user.id }}
            submitLabel="Record adjustment"
          >
            <div className="flex flex-wrap gap-2">
              <SelectField
                id="featureKey"
                label="Feature"
                size="sm"
                showMessage={false}
                wrapClassName="w-52"
              >
                {METERED_FEATURES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="quantityDelta"
                label="Delta"
                type="number"
                required
                placeholder="-1"
                size="sm"
                showMessage={false}
                wrapClassName="w-28"
              />
            </div>
          </AdminForm>
        </div>
      </SectionCard>

      <SectionCard title="Entitlement overrides" className="mb-4">
        {overrides.length === 0 ? (
          <p className="hp-small text-text-muted">None.</p>
        ) : (
          <ul className="mb-3 divide-y divide-border">
            {overrides.map((o) => (
              <li key={o.id} className="py-2">
                <p className="hp-small text-text">
                  {o.key} = {JSON.stringify(o.value)}
                </p>
                <p className="hp-small text-text-muted">
                  {o.reason} ·{' '}
                  {o.endsAt ? `until ${o.endsAt.slice(0, 10)}` : 'open-ended'}
                </p>
                <div className="mt-1">
                  <AdminForm
                    action={revokeOverrideAction}
                    hidden={{ overrideId: o.id, userId: user.id }}
                    submitLabel="End now"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border pt-3">
          <AdminForm
            action={grantOverrideAction}
            hidden={{ userId: user.id }}
            submitLabel="Grant override"
          >
            <div className="flex flex-wrap gap-2">
              <SelectField
                id="entitlementKey"
                label="Entitlement"
                size="sm"
                showMessage={false}
                wrapClassName="w-52"
              >
                {ENTITLEMENT_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </SelectField>
              <TextField
                id="value"
                label="Value"
                required
                placeholder="true / 100 / null"
                size="sm"
                showMessage={false}
                wrapClassName="w-36"
              />
              <TextField
                id="endsAt"
                label="Ends"
                type="date"
                size="sm"
                showMessage={false}
                wrapClassName="w-40"
              />
            </div>
            {/* A promotion nobody remembers granting is a promotion nobody ends. */}
            <p className="hp-small text-text-muted">
              Leave the date empty for open-ended — but most grants should have one.
            </p>
          </AdminForm>
        </div>
      </SectionCard>

      <SectionCard title="Support notes" className="mb-4">
        {notes.length === 0 ? (
          <p className="hp-small text-text-muted">No notes yet.</p>
        ) : (
          <ul className="mb-3 divide-y divide-border">
            {notes.map((n) => (
              <li key={n.id} className="py-2">
                <p className="hp-small whitespace-pre-wrap text-text">{n.note}</p>
                <p className="hp-small text-text-muted">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border pt-3">
          <AdminForm
            action={addSupportNoteAction}
            hidden={{ userId: user.id }}
            submitLabel="Add note"
            reasonLabel="Note"
            reasonName="note"
            multiline
          />
        </div>
      </SectionCard>

      <SectionCard title="Recent operational events">
        {events.length === 0 ? (
          <p className="hp-small text-text-muted">Nothing recorded.</p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-2">
                <span className="hp-small text-text">
                  {e.eventType.replace(/_/g, ' ')}
                </span>
                <span className="hp-small text-text-muted">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="hp-label text-text-muted">{label}</dt>
      <dd className="hp-small mt-0.5 text-text">{children}</dd>
    </div>
  );
}
