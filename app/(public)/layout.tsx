import type { Metadata } from 'next';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { ConsentBanner } from '@/components/consent/consent-banner';
import { BackToTop } from '@/components/navigation/back-to-top';

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
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      {/* tabIndex -1: focus target for the skip link and Back to top. */}
      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <SiteFooter />

      <BackToTop />

      {/*
        §49 — public site only. The authenticated app uses only the session
        cookie, which is strictly necessary and offers no meaningful choice;
        asking there would be a banner that can log you out.
      */}
      <ConsentBanner />
    </div>
  );
}
