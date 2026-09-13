import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Sign-in problem' };

const MESSAGES: Record<string, string> = {
  missing_code: 'That sign-in link was incomplete. Please request a new one.',
  exchange_failed:
    'That link is invalid or has already been used. Please request a new one.',
  no_profile:
    'Your account exists but its profile is missing. Sign out and in again — if it persists, contact support.',
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  // Only render known reasons. The value arrives in a query string, so echoing
  // it back would be a reflected-content hole.
  const message = (reason && MESSAGES[reason]) ?? 'We could not complete sign-in.';

  return (
    <>
      <h1 className="hp-h1 mb-1 text-text">Sign-in problem</h1>
      <p className="hp-body mb-6 text-text-muted">{message}</p>
      <Link href="/login" className={buttonClass('primary', 'md', 'w-full')}>
        Back to sign in
      </Link>
    </>
  );
}
