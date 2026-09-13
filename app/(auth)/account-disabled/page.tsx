import type { Metadata } from 'next';
import { LogoutButton } from '@/components/auth/logout-button';

export const metadata: Metadata = { title: 'Account disabled' };

export default function AccountAccountdisabledPage() {
  return (
    <>
      <h1 className="hp-h1 mb-1 text-text">Account disabled</h1>
      <p className="hp-body mb-4 text-text-muted">
        Your HelloPera account has been disabled. Your financial data is safe and has not
        been deleted.
      </p>
      <p className="hp-small mb-6 text-text-muted">
        If you think this is a mistake, reply to any HelloPera email or use the contact
        page.
      </p>
      <LogoutButton />
    </>
  );
}
