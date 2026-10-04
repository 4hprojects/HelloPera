'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppLogo } from '@/components/brand/app-logo';
import { ChevronRightIcon, CloseIcon, Icon, MenuIcon } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import type { NavItem } from '@/lib/constants/navigation';
import { cn } from '@/lib/utils/cn';

/** Dispatched by the bottom bar's "More" tab to open this drawer. */
export const OPEN_NAV_EVENT = 'hp:open-nav';

/**
 * Hamburger button plus a slide-in drawer, for everything below `lg`.
 *
 * The same items and dark rail colours as the desktop sidebar, so the menu
 * reads as the same thing at every width. A native <dialog> gives focus
 * trapping, Escape-to-close and an inert page behind it.
 */
export function NavDrawer({
  items,
  user,
  footer,
}: {
  items: NavItem[];
  user?: { name: string | null; email: string; plan: string; href: string };
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      setOpen(true);
    }
  };
  const hide = () => dialogRef.current?.close();

  // Navigating closes the drawer.
  useEffect(() => {
    if (dialogRef.current?.open) dialogRef.current.close();
  }, [pathname]);

  // The bottom bar's "More" tab asks for the same menu.
  useEffect(() => {
    window.addEventListener(OPEN_NAV_EVENT, show);
    return () => window.removeEventListener(OPEN_NAV_EVENT, show);
  }, []);

  // Growing to desktop width swaps in the sidebar; do not strand an open dialog.
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = () => query.matches && dialogRef.current?.close();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="app-nav-drawer"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-muted hover:text-text lg:hidden"
      >
        <MenuIcon size={20} />
        <span className="sr-only">Open menu</span>
      </button>

      <dialog
        ref={dialogRef}
        id="app-nav-drawer"
        aria-label="Main menu"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // The backdrop is outside the box, so a click there targets the dialog.
          if (event.target === event.currentTarget) hide();
        }}
        className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(20rem,85vw)] max-w-none overflow-hidden bg-nav p-0 text-nav-text shadow-xl backdrop:bg-black/50"
      >
        {open ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
              <Link href="/dashboard" className="inline-flex rounded">
                <AppLogo tone="onDark" />
              </Link>
              <button
                type="button"
                onClick={hide}
                aria-label="Close menu"
                className="inline-flex size-11 items-center justify-center rounded-full text-nav-muted hover:bg-nav-raised hover:text-nav-text"
              >
                <CloseIcon size={22} />
              </button>
            </div>

            <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-3">
              <ul className="space-y-0.5 pb-3">
                {items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                          className="flex min-h-11 items-center gap-3 rounded-[var(--radius-hp)] px-3 text-sm text-nav-muted opacity-55"
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
                          'flex min-h-11 items-center gap-3 rounded-[var(--radius-hp)] px-3 text-sm transition-colors',
                          active
                            ? 'bg-nav-active font-semibold text-white'
                            : 'text-nav-text/85 hover:bg-nav-raised hover:text-nav-text',
                        )}
                      >
                        {inner}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {user ? (
              <div className="px-3 pb-3">
                <Link
                  href={user.href}
                  className="flex items-center gap-3 rounded-[var(--radius-hp)] bg-nav-raised px-3 py-3 hover:bg-nav-raised/70"
                >
                  <Avatar name={user.name ?? user.email} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-nav-text">
                      {user.name ?? user.email}
                    </span>
                    <span className="block truncate text-xs text-nav-muted">
                      {user.plan}
                    </span>
                  </span>
                  <ChevronRightIcon size={16} className="shrink-0 text-nav-muted" />
                </Link>
              </div>
            ) : null}
            {footer ? (
              <div className="border-t border-nav-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                {footer}
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
