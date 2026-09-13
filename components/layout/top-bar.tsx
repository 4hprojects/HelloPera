import Link from 'next/link';
import { BellIcon, SearchIcon } from '@/components/icons';
import { AppLogo } from '@/components/brand/app-logo';
import { Avatar } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * Application top bar — search, notifications, account.
 *
 * The search field is a GET form onto /transactions rather than a live
 * combobox: it is the one search surface that already exists, and a box that
 * looks like it searches everything while searching one table is worse than
 * one that says what it does. Its placeholder and its label say so.
 *
 * The bell is a link to the bills list, not a notification centre —
 * notifications are Phase 08. It shows a count only when there is one.
 */
export function TopBar({
  user,
  dueCount = 0,
}: {
  user: { name: string | null; email: string };
  dueCount?: number;
}) {
  const displayName = user.name ?? user.email;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        {/* The rail carries the wordmark on desktop; on mobile it is hidden,
            so the bar carries it instead. */}
        <Link href="/dashboard" className="inline-flex rounded lg:hidden">
          <AppLogo size="sm" />
        </Link>

        <form
          action="/transactions"
          method="get"
          className="min-w-0 flex-1"
          role="search"
        >
          <label htmlFor="global-search" className="sr-only">
            Search transactions
          </label>
          <div className="relative max-w-md">
            <SearchIcon
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id="global-search"
              name="search"
              type="search"
              autoComplete="off"
              placeholder="Search transactions…"
              className="h-10 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-sm text-text placeholder:text-text-muted"
            />
          </div>
        </form>

        {/* At phone width the bar is already search + bell + account. The
            same control sits in Settings, which is where the mobile bar's
            "More" tab lands. */}
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        <Link
          href="/bills"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:text-text"
        >
          <BellIcon size={19} />
          <span className="sr-only">
            {dueCount > 0 ? `Bills: ${dueCount} due or overdue` : 'Bills'}
          </span>
          {dueCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-danger-text px-1 text-[0.625rem] font-bold text-white"
            >
              {dueCount > 9 ? '9+' : dueCount}
            </span>
          ) : null}
        </Link>

        <Link href="/settings" className="inline-flex rounded-full">
          <Avatar name={displayName} size={40} />
          <span className="sr-only">Account settings for {displayName}</span>
        </Link>
      </div>
    </header>
  );
}
