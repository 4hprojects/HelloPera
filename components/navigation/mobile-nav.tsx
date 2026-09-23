'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CloseIcon, Icon, MoreIcon } from '@/components/icons';
import type { NavItem } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';

/**
 * Bottom navigation for touch devices.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreActive = moreItems.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [pathname]);

  function openMenu() {
    dialogRef.current?.showModal();
    setMenuOpen(true);
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

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
            onClick={openMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-more-menu"
            className={cn(
              'flex h-16 w-full flex-col items-center justify-center gap-1 text-[0.6875rem]',
              menuOpen || moreActive
                ? 'bg-primary-wash text-primary-text'
                : 'text-text-muted hover:bg-surface-muted',
            )}
          >
            <MoreIcon size={21} />
            <span className="leading-none">More</span>
          </button>
        </li>
      </ul>

      <dialog
        ref={dialogRef}
        id="mobile-more-menu"
        aria-labelledby="mobile-more-title"
        onClose={() => setMenuOpen(false)}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientY < bounds.top) closeMenu();
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[80dvh] w-full max-w-none rounded-t-[var(--radius-hp)] bg-surface p-0 text-text shadow-lg backdrop:bg-text/40"
      >
        <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <header className="mb-3 flex items-center justify-between gap-3">
            <h2 id="mobile-more-title" className="hp-h2">
              More
            </h2>
            <button
              type="button"
              onClick={closeMenu}
              aria-label="Close menu"
              className="inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-hp)] text-text-muted hover:bg-surface-muted hover:text-text"
            >
              <CloseIcon size={22} />
            </button>
          </header>

          <ul className="grid grid-cols-2 gap-2">
            {moreItems.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-12 items-center gap-3 rounded-[var(--radius-hp)] px-3 py-2 text-sm',
                      active
                        ? 'bg-primary-wash text-primary-text'
                        : 'bg-surface-muted text-text',
                    )}
                  >
                    {item.icon ? <Icon name={item.icon} size={20} /> : null}
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </nav>
  );
}
