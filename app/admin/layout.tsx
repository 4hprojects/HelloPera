import Link from 'next/link';
import { Sidebar } from '@/components/navigation/sidebar';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LogoutButton } from '@/components/auth/logout-button';
import { requireAdmin } from '@/lib/auth/guards';
import { adminNav } from '@/lib/constants/navigation';

/**
 * Admin shell.
 *
 * requireAdmin() checks status before role — a suspended admin is suspended
 * (§33). Admin is operational privilege, not a bypass.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={adminNav}
        footer={
          <div className="space-y-2">
            <ThemeToggle />
            <p className="hp-small truncate text-text-muted">{profile.email}</p>
            <LogoutButton className="h-9 w-full rounded-[var(--radius-hp)] border border-border-strong text-sm font-medium text-text" />
          </div>
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border bg-surface px-4 py-2">
          <Link href="/dashboard" className="hp-small text-primary-text">
            ← Back to app
          </Link>
        </div>
        <main id="main" className="flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
