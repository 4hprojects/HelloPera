'use client';

import { useTransition } from 'react';
import { logout } from '@/app/actions/auth';

export function LogoutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void logout())}
      className={
        className ??
        'inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-hp)] border border-border-strong font-medium text-text disabled:opacity-50'
      }
    >
      {pending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
