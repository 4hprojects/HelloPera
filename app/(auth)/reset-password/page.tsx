import type { Metadata } from 'next';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Set a new password' };

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="hp-h1 mb-1 text-text">Set a new password</h1>
      <p className="hp-body mb-6 text-text-muted">
        Choose a password you haven&apos;t used before.
      </p>
      <ResetPasswordForm />
    </>
  );
}
