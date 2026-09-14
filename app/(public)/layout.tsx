import type { Metadata } from 'next';
import Link from 'next/link';
import { AppLogo } from '@/components/brand/app-logo';
import { SiteFooter } from '@/components/layout/site-footer';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { buttonClass } from '@/components/ui/button';
import { headerRoutes } from '@/lib/seo/routes';
import { ConsentBanner } from '@/components/consent/consent-banner';

/**
 * PHASE-10 §33 — the public site is the ONLY part of HelloPera that is
 * indexable.
 *
 * The root layout sets `noindex` for everything, so a new route is private
 * until someone decides otherwise. This override applies to the `(public)`
 * group alone, which means authenticated and admin routes cannot be
 * accidentally exposed by forgetting a per-page opt-out — there is nothing to
 * forget.
 *
 * `max-image-preview: large` and the snippet allowances are what let a guide
 * appear as a rich result rather than a bare blue link.
 */
export const metadata: Metadata = {
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const nav = headerRoutes();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="rounded">
            <AppLogo />
          </Link>

          {/*
            §11, §66 — the nav is now driven by the route registry rather than
            a hand-kept list, which is why /pricing shipped unreachable: it
            existed as a page and appeared in neither the header nor the
            footer.

            Visible at every width. Previously `hidden sm:flex`, which left
            phone visitors with no navigation at all — the single largest
            share of traffic for a mobile-first product.
          */}
          <nav
            aria-label="Site"
            className="flex flex-1 flex-wrap justify-center gap-x-4 gap-y-1 sm:gap-5"
          >
            {nav.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className="hp-small text-text-muted hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className={buttonClass('primary', 'sm')}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <SiteFooter />

      {/*
        §49 — public site only. The authenticated app uses only the session
        cookie, which is strictly necessary and offers no meaningful choice;
        asking there would be a banner that can log you out.
      */}
      <ConsentBanner />
    </div>
  );
}
