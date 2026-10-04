'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, MoreIcon } from '@/components/icons';
import { OPEN_NAV_EVENT } from '@/components/navigation/nav-drawer';
import type { NavItem } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';

/**
 * Bottom navigation for touch devices. "More" opens the hamburger drawer
 * (`NavDrawer`) rather than a second sheet, so there is one full menu.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the bar clear of the iOS home
 * indicator; without it the last row of tap targets sits under the gesture
 * area and becomes unreliable.
 */
export function MobileNav({
  items,
  moreItems,
}: {
  items: NavItem[];
  moreItems: NavItem[];
}) {
  const pathname = usePathname();
  const moreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const classes = cn(
            'flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem]',
            active
              ? 'bg-primary-wash text-primary-text'
              : 'text-text-muted hover:bg-surface-muted',
          );
          const inner = (
            <>
              {item.icon ? <Icon name={item.icon} size={21} /> : null}
              <span className="leading-none">{item.label}</span>
            </>
          );
          return (
            <li key={item.href}>
              {item.placeholder ? (
                <span
                  className={cn(classes, 'opacity-50')}
                  title={`Arrives in Phase ${item.phase}`}
                >
                  {inner}
                </span>
              ) : (
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={classes}
                >
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
            aria-haspopup="dialog"
            aria-controls="app-nav-drawer"
            className={cn(
              'flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.6875rem]',
              moreActive
                ? 'bg-primary-wash text-primary-text'
                : 'text-text-muted hover:bg-surface-muted',
            )}
          >
            <MoreIcon size={21} />
            <span className="leading-none">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
