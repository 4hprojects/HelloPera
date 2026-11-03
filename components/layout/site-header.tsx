'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppLogo } from '@/components/brand/app-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { buttonClass } from '@/components/ui/button';
import { headerRoutes } from '@/lib/seo/routes';

/**
 * The header for every signed-out surface — public pages and auth pages alike.
 *
 * It used to live inside `app/(public)/layout.tsx`, which meant `/register`
 * and `/login` had no navigation at all: someone arriving at sign-up from a
 * search result could not reach Features, Pricing or Guides without the back
 * button. One component, used by both layouts, so they cannot drift — the
 * same reasoning that put `/login` and `/register` on one `AuthShell`.
 *
 * ## Why it reads the pathname rather than taking a prop
 *
 * A layout wraps many pages and cannot know which one it has, so threading
 * "which account button to show" down from the layout is impossible without
 * duplicating the header into every page. `usePathname` is what a navigation
 * bar wants anyway — it is also what marks the current page with
 * `aria-current`, which this nav previously did not do at all.
 *
 * The cost is that the header hydrates. It is links and a theme toggle, and
 * `ThemeToggle` was already a client component, so nothing new ships.
 *
 * ## Never offer the page you are on
 *
 * The public header offers both Sign in and Get started. On an auth page one
 * of those points at the current page, so it offers the *opposite* action —
 * which is also the one the visitor is more likely to want: someone on
 * sign-up who already has an account needs Sign in.
 *
 * ## Indexing lives in the layout, not here
 *
 * `app/(public)/layout.tsx` exports a `metadata.robots` override flipping the
 * root's blanket `noindex`. That export is deliberately NOT part of this
 * component — sharing it would make `/register` and `/login` indexable and
 * contradict `DISALLOWED_PREFIXES` in `lib/seo/routes.ts`.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const nav = headerRoutes();

  const onRegister = pathname === '/register';
  const onLogin = pathname === '/login';

  const showSignIn = !onLogin;
  const showRegister = !onRegister;
  const bothShown = showSignIn && showRegister;

  return (
    <header className="border-b border-border bg-surface">
      {/*
        Two rows below `lg`, one from `lg` up (HP-024).

        Measured at 375 and 768px: logo, nav, theme toggle and both buttons
        need about 725px on one line, and the nav wrapped inside whatever was
        left, stranding "Help" on a line of its own (a 213px header on a
        phone). So below `lg` the logo and the actions share the first row
        and the nav gets the full width of the second. On a phone the theme
        toggle moves to the footer: the nav alone fills the row.

        Sign in is hidden on a phone by a wrapper, not by a class on the
        link: `buttonClass` sets `inline-flex`, which overrode `hidden`.
      */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 px-4 py-2 lg:flex-nowrap lg:py-3">
        <Link href="/" className="order-1 shrink-0 rounded">
          <AppLogo />
        </Link>

        {/*
          §11, §66 — driven by the route registry rather than a hand-kept
          list, which is why /pricing once shipped unreachable: it existed as
          a page and appeared in neither the header nor the footer.
        */}
        <nav
          aria-label="Site"
          className="order-3 flex w-full justify-between gap-x-4 sm:justify-start sm:gap-x-6 lg:order-2 lg:w-auto lg:flex-1 lg:justify-center"
        >
          {nav.map((item) => {
            const current = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={current ? 'page' : undefined}
                className={
                  current
                    ? 'inline-flex min-h-11 items-center hp-small font-semibold text-text'
                    : 'inline-flex min-h-11 items-center hp-small text-text-muted hover:text-text'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="order-2 flex shrink-0 items-center gap-2 sm:gap-3 lg:order-3">
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          {showSignIn ? (
            <span className={bothShown ? 'hidden sm:inline-flex' : 'inline-flex'}>
              <Link
                href="/login"
                className={buttonClass(
                  // Ghost beside Get started, primary when it stands alone —
                  // a lone ghost button reads as disabled.
                  bothShown ? 'ghost' : 'primary',
                  'sm',
                )}
              >
                Sign in
              </Link>
            </span>
          ) : null}
          {showRegister ? (
            <Link href="/register" className={buttonClass('primary', 'sm')}>
              Get started
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
