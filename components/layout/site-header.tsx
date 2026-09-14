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
        Two rows on a phone, one from `sm` up.

        Measured, not guessed: at 320px the logo is ~140px and the theme
        toggle ~165px, so logo + toggle + call-to-action needs ~395px in the
        288px a 320px viewport leaves after the gutters. The old single row
        overflowed at every phone width — the landing page scrolled sideways
        by 237px — which is exactly the audience this product is built for.

        So the container wraps, and explicit `order` puts the nav and the
        toggle on their own line below the logo and the CTA. Row one is then
        ~250px and row two ~235px, both inside 288. From `sm` the order
        returns to logo / nav / toggle / CTA on one line.
      */}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="order-1 shrink-0 rounded">
          <AppLogo />
        </Link>

        <div className="order-3 flex w-full items-center justify-between gap-3 sm:order-2 sm:w-auto sm:flex-1 sm:justify-center">
          {/*
            §11, §66 — driven by the route registry rather than a hand-kept
            list, which is why /pricing once shipped unreachable: it existed as
            a page and appeared in neither the header nor the footer.

            Visible at every width. It was `hidden sm:flex`, which left phone
            visitors with no navigation at all.
          */}
          <nav
            aria-label="Site"
            className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-center sm:gap-5"
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
                      ? 'hp-small font-semibold text-text'
                      : 'hp-small text-text-muted hover:text-text'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>

        <div className="order-2 flex shrink-0 items-center gap-2 sm:order-3 sm:gap-3">
          {showSignIn ? (
            <Link
              href="/login"
              className={buttonClass(
                // Ghost beside Get started, primary when it stands alone —
                // a lone ghost button reads as disabled.
                bothShown ? 'ghost' : 'primary',
                'sm',
                bothShown ? 'hidden sm:inline-flex' : undefined,
              )}
            >
              Sign in
            </Link>
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
