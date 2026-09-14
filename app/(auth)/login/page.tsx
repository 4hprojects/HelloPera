import type { Metadata } from 'next';
import Link from 'next/link';
import { redirectIfAuthenticated } from '@/lib/auth/guards';
import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  await redirectIfAuthenticated();
  const params = await searchParams;

  return (
    // The same shell as /register, so the two do not drift apart — a person
    // moving between them should not feel they changed product.
    <AuthShell
      title="Welcome back"
      subtitle="Your accounts, bills and receivables are where you left them."
    >
      <h2 className="hp-h2 text-text">Sign in</h2>
      <p className="hp-body mb-6 mt-1 text-text-muted">Pick up where you left off.</p>

      <LoginForm cancelled={Boolean(params.cancelled)} />

      <p className="hp-small mt-6 text-center text-text-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-primary-text">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
