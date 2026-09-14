import { MobileNav } from '@/components/navigation/mobile-nav';
import { Sidebar } from '@/components/navigation/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { LogoutButton } from '@/components/auth/logout-button';
import { requireUser } from '@/lib/auth/guards';
import { appNav, mobileNav } from '@/lib/constants/navigation';
import { unreadCount } from '@/services/notification.service';
import { getEffectivePlan } from '@/services/plan.service';

/**
 * Authenticated shell.
 *
 * requireUser() runs here rather than in each page, so a new route under this
 * group is protected by existing — the failure mode of per-page guards is a
 * page that simply forgets.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();

  // §20 — the bell counts unread notifications. If the count cannot be read,
  // the bar renders without a badge rather than taking the whole shell down.
  const unread = await unreadCount().catch(() => 0);

  // PHASE-09 — the plan line was hardcoded 'Free plan'. It now resolves, and
  // falls back to Free if resolution fails, which is the same answer §53 asks
  // for everywhere else.
  const effective = await getEffectivePlan(user.id).catch(() => null);
  const planLabel = effective ? `${effective.plan.name} plan` : 'Free plan';

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        items={appNav}
        user={{
          name: profile.full_name,
          email: profile.email ?? '',
          plan: planLabel,
          href: '/settings/plan',
        }}
        footer={
          <LogoutButton className="h-10 w-full rounded-[var(--radius-hp)] text-sm font-medium text-nav-muted hover:bg-nav-raised hover:text-nav-text" />
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={{ name: profile.full_name, email: profile.email ?? '' }}
          unreadCount={unread}
        />
        <main id="main" className="flex-1 px-4 pb-24 pt-5 sm:px-6 lg:pb-10">
          {children}
        </main>
      </div>

      <MobileNav items={mobileNav} />
    </div>
  );
}
