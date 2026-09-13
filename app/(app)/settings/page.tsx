import type { Metadata } from 'next';
import { Badge } from '@/components/ui/badge';
import { Card, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { requireUser } from '@/lib/auth/guards';
import { SettingsForm } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your account and preferences." />

      <Card className="mb-4">
        <CardTitle>Profile</CardTitle>
        <p className="hp-small mb-4 mt-1 text-text-muted">
          Your email is managed by your sign-in method and cannot be changed here.
        </p>
        <SettingsForm
          fullName={profile.full_name ?? ''}
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

      <Card>
        <CardTitle>Delete account</CardTitle>
        <p className="hp-body mt-1 text-text-muted">
          Account deletion is not available yet. It must remove your financial records,
          documents and storage objects together, and those do not exist until later
          phases — a partial deletion would be worse than none.
        </p>
        <p className="hp-small mt-2 text-text-muted">
          It will be working before HelloPera is publicly available.
        </p>
      </Card>
    </div>
  );
}
