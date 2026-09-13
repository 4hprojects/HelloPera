'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icons';
import type { NavItem } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';

/**
 * Bottom navigation for touch devices.
 *
 * `pb-[env(safe-area-inset-bottom)]` keeps the bar clear of the iOS home
 * indicator; without it the last row of tap targets sits under the gesture
 * area and becomes unreliable.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

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
            active ? 'font-semibold text-primary-text' : 'text-text-muted',
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
      </ul>
    </nav>
  );
}
