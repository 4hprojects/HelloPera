'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppLogo } from '@/components/brand/app-logo';
import { LeafMark } from '@/components/brand/motifs';
import { ChevronRightIcon, Icon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { BRAND } from '@/lib/constants/brand';
import type { NavItem } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';

/**
 * Desktop navigation rail — Deep Ink, as the showcase draws it. Hidden below
 * `lg`; touch devices get the bottom bar instead.
 *
 * The rail carries its own colour tokens (`--hp-nav-*`) rather than the page
 * surface tokens, because it stays dark in both themes. Every foreground on
 * it was measured against the rail, not against the page background.
 */
export function Sidebar({
  items,
  user,
  footer,
}: {
  items: NavItem[];
  user?: { name: string | null; email: string; plan: string; href: string };
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <aside className="relative hidden w-64 shrink-0 overflow-hidden bg-nav lg:flex lg:flex-col">
      {/* Leaf watermark — the showcase's plant motif, well below any text so
          it never competes with a label for contrast. */}
      <LeafMark
        size={220}
        className="pointer-events-none absolute -bottom-10 -left-12 opacity-[0.07]"
      />

      <div className="relative px-5 pb-5 pt-6">
        <Link href="/dashboard" className="inline-flex rounded">
          <AppLogo tone="onDark" />
        </Link>
        <p className="hp-small mt-2 max-w-[14rem] text-nav-muted">{BRAND.taglineLong}</p>
      </div>

      <nav aria-label="Main" className="relative mt-2 flex-1 px-3">
        <ul className="space-y-0.5">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const inner = (
              <>
                {item.icon ? <Icon name={item.icon} className="shrink-0" /> : null}
                <span className="truncate">{item.label}</span>
              </>
            );

            if (item.placeholder) {
              return (
                <li key={item.href}>
                  <span
                    className="flex items-center gap-3 rounded-[var(--radius-hp)] px-3 py-2.5 text-sm text-nav-muted opacity-55"
                    title={`Arrives in Phase ${item.phase}`}
                  >
                    {inner}
                    <span className="hp-label ml-auto text-[0.625rem]">
                      P{item.phase}
                    </span>
                  </span>
                </li>
              );
            }

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center gap-3 rounded-[var(--radius-hp)]',
                    'px-3 py-2.5 text-sm transition-colors',
                    active
                      ? 'bg-nav-active font-semibold text-white'
                      : 'text-nav-text/85 hover:bg-nav-raised hover:text-nav-text',
                  )}
                >
                  {/* The showcase marks the active row with a light bar at
                      the rail's edge as well as the fill — two signals, not
                      colour alone. */}
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute -left-3 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-primary-soft"
                    />
                  ) : null}
                  {inner}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="relative px-5 pb-4 pt-6">
        <p className="hp-small italic leading-snug text-nav-muted">{BRAND.motto}</p>
      </div>

      {user ? (
        <div className="relative px-3 pb-3">
          <Link
            href={user.href}
            className="flex items-center gap-3 rounded-[var(--radius-hp)] bg-nav-raised px-3 py-3 transition-colors hover:bg-nav-raised/70"
          >
            <Avatar name={user.name ?? user.email} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-nav-text">
                {user.name ?? user.email}
              </span>
              <span className="block truncate text-xs text-nav-muted">{user.plan}</span>
            </span>
            <ChevronRightIcon size={16} className="shrink-0 text-nav-muted" />
          </Link>
        </div>
      ) : null}

      {footer ? (
        <div className="relative border-t border-nav-border p-3">{footer}</div>
      ) : null}
    </aside>
  );
}
