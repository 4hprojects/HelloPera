import type { Metadata } from 'next';
import Link from 'next/link';
import { redirectIfAuthenticated } from '@/lib/auth/guards';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create account' };

export default async function RegisterPage() {
  await redirectIfAuthenticated();
  return (
    <>
      <h1 className="hp-h1 mb-1 text-text">Create your account</h1>
      <p className="hp-body mb-6 text-text-muted">
        Track your money, bills and receivables in one place.
      </p>
      <RegisterForm />
      <p className="hp-small mt-6 text-center text-text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-primary-text">
          Sign in
        </Link>
      </p>
    </>
  );
}
