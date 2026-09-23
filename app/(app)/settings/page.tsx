import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { requireUser } from '@/lib/auth/guards';
import { adminEntry } from '@/lib/constants/navigation';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your account and preferences." />

      {/*
        Phones have no sidebar, and "More" lands here, so this is their way into
        the admin area. Admins only; the route itself is guarded separately.
      */}
      {profile.role === 'admin' ? (
        <Card className="mb-4">
          <CardTitle>Admin</CardTitle>
          <p className="hp-body mt-1 text-text-muted">
            Users, feature flags, usage, jobs and the audit log.
          </p>
          <Link
            href={adminEntry.href}
            className={`${buttonClass('secondary', 'sm')} mt-3 inline-flex`}
          >
            Open the admin area
          </Link>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardTitle>Profile</CardTitle>
        <p className="hp-small mb-4 mt-1 text-text-muted">
          Your email is managed by your sign-in method and cannot be changed here.
        </p>
        <SettingsForm
          firstName={profile.first_name ?? ''}
          lastName={profile.last_name ?? ''}
          timezone={profile.timezone}
          defaultCurrency={profile.default_currency}
        />
      </Card>

      <Card className="mb-4">
        <CardTitle>Appearance</CardTitle>
        <p className="hp-small mb-3 mt-1 text-text-muted">
          System follows your device setting.
        </p>
        <ThemeToggle />
      </Card>

      <Card className="mb-4">
        <CardTitle>Account</CardTitle>
        <dl className="mt-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <dt className="hp-small text-text-muted">Email</dt>
            <dd className="hp-small truncate text-text">{profile.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="hp-small text-text-muted">Sign-in method</dt>
            <dd className="hp-small text-text">
              {user.app_metadata?.provider === 'google' ? 'Google' : 'Email and password'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="hp-small text-text-muted">Role</dt>
            <dd>
              <Badge tone={profile.role === 'admin' ? 'info' : 'neutral'}>
                {profile.role}
              </Badge>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="hp-small text-text-muted">Status</dt>
            <dd>
              <Badge tone="success">{profile.status}</Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="mb-4">
        <CardTitle>Your data</CardTitle>
        <p className="hp-body mt-1 text-text-muted">
          Download everything HelloPera holds for you, as CSV or JSON.
        </p>
        <Link
          href="/settings/data"
          className={`${buttonClass('secondary', 'sm')} mt-3 inline-flex`}
        >
          Export my data
        </Link>
      </Card>

      <Card>
        <CardTitle>Delete account</CardTitle>
        <p className="hp-body mt-1 text-text-muted">
          Permanently remove your account, your financial records and your uploaded files.
          This cannot be undone.
        </p>
        <Link
          href="/settings/delete"
          className={`${buttonClass('ghost', 'sm')} mt-3 inline-flex`}
        >
          Delete my account
        </Link>
      </Card>
    </div>
  );
}
