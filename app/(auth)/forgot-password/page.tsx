import type { Metadata } from 'next';
import Link from 'next/link';
import { ForgotPasswordForm } from './forgot-password-form';
import { AuthColumn } from '@/components/auth/auth-column';

export const metadata: Metadata = { title: 'Reset password' };

export default function ForgotPasswordPage() {
  return (
    <AuthColumn>
      <h1 className="hp-h1 mb-1 text-text">Reset your password</h1>
      <p className="hp-body mb-6 text-text-muted">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <ForgotPasswordForm />
      <p className="hp-small mt-6 text-center text-text-muted">
        <Link href="/login" className="font-medium text-primary-text">
          Back to sign in
        </Link>
      </p>
    </AuthColumn>
  );
}
