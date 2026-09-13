import type { Metadata } from 'next';
import Link from 'next/link';
import { redirectIfAuthenticated } from '@/lib/auth/guards';
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
    <>
      <h1 className="hp-h1 mb-1 text-text">Sign in</h1>
      <p className="hp-body mb-6 text-text-muted">Welcome back to HelloPera.</p>
      <LoginForm cancelled={Boolean(params.cancelled)} />
      <p className="hp-small mt-6 text-center text-text-muted">
        New here?{' '}
        <Link href="/register" className="font-medium text-primary-text">
          Create an account
        </Link>
      </p>
    </>
  );
}
