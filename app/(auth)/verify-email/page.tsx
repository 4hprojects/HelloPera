import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { buttonClass } from '@/components/ui/button';
import { AuthColumn } from '@/components/auth/auth-column';

export const metadata: Metadata = { title: 'Verify your email' };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const user = await getCurrentUser();
  // Already verified — nothing to do here.
  if (user?.email_confirmed_at) redirect('/dashboard');

  const params = await searchParams;
  const email = params.email ?? user?.email ?? null;

  return (
    <AuthColumn>
      <h1 className="hp-h1 mb-1 text-text">Check your inbox</h1>
      <p className="hp-body mb-4 text-text-muted">
        {email ? (
          <>
            We sent a verification link to{' '}
            <span className="font-medium text-text">{email}</span>.
          </>
        ) : (
          'We sent you a verification link.'
        )}{' '}
        Click it to finish setting up your account.
      </p>
      <p className="hp-small mb-6 text-text-muted">
        The link expires after a while. If it has, sign in again to get a new one. Check
        your spam folder before asking for another.
      </p>
      <Link href="/login" className={buttonClass('ghost', 'md', 'w-full')}>
        Back to sign in
      </Link>
    </AuthColumn>
  );
}
