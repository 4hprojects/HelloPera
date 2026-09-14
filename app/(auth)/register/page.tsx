import type { Metadata } from 'next';
import Link from 'next/link';
import { redirectIfAuthenticated } from '@/lib/auth/guards';
import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectIfAuthenticated();
  const params = await searchParams;

  // `/login` already handled this; `/register` did not, so a Google flow
  // abandoned from here returned the user to a page that said nothing about
  // what had happened.
  const cancelled = params.cancelled !== undefined;

  return (
    <AuthShell
      title="Start where your money actually is"
      subtitle="Cash, e-wallets, bills and the people who owe you — tracked in one place, by you."
    >
      <h2 className="hp-h2 text-text">Create your account</h2>
      <p className="hp-body mb-6 mt-1 text-text-muted">
        Free to use. No bank connection required.
      </p>

      <RegisterForm cancelled={cancelled} />

      <p className="hp-small mt-6 text-center text-text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary-text">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
