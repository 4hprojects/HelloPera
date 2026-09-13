import { MobileNav } from '@/components/navigation/mobile-nav';
import { Sidebar } from '@/components/navigation/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { LogoutButton } from '@/components/auth/logout-button';
import { requireUser } from '@/lib/auth/guards';
import { appNav, mobileNav } from '@/lib/constants/navigation';
import { todayInTimezone } from '@/lib/finance/obligation';
import { listObligations } from '@/services/obligation.service';

/**
 * Authenticated shell.
 *
 * requireUser() runs here rather than in each page, so a new route under this
 * group is protected by existing — the failure mode of per-page guards is a
 * page that simply forgets.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser();

  // The bell counts what is actually late or landing, not every open bill.
  // If the count cannot be read, the bar renders without a badge rather than
  // taking the whole shell down with it.
  const dueCount = await countDue(profile.timezone).catch(() => 0);

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={appNav}
        user={{
          name: profile.full_name,
          email: profile.email ?? '',
          // Phase 09 owns real tiers; until then every account is on Free.
          plan: 'Free plan',
          href: '/settings',
        }}
        footer={
          <LogoutButton className="h-10 w-full rounded-[var(--radius-hp)] text-sm font-medium text-nav-muted hover:bg-nav-raised hover:text-nav-text" />
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={{ name: profile.full_name, email: profile.email ?? '' }}
          dueCount={dueCount}
        />
        <main id="main" className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileNav items={mobileNav} />
    </div>
  );
}

async function countDue(timezone: string): Promise<number> {
  const today = todayInTimezone(timezone);
  const bills = await listObligations('bill', today, { onlyOpen: true });
  return bills.filter(
    (b) =>
      b.display === 'overdue' || b.display === 'due_today' || b.display === 'due_soon',
  ).length;
}
