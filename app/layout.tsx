import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { ThemeScript } from '@/components/ui/theme-script';
import { BRAND } from '@/lib/constants/brand';
import { appUrl } from '@/lib/env';
import './globals.css';

/**
 * Plus Jakarta Sans — the showcase typeface. next/font self-hosts the files
 * at build time, so no request goes to Google at runtime and there is no
 * layout shift while a webfont arrives.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: `${BRAND.name} — Personal Finance Tracking Made Simple`,
    template: `%s | ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  // §35 — the image files exist by convention (app/twitter-image.png), but
  // nothing declared the card type, so they rendered as a small thumbnail.
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  /**
   * PHASE-10 §33 — indexing is OPT-IN, route group by route group.
   *
   * The default stays `noindex` so a new route is private until somebody
   * decides otherwise. That is the safe direction: a page accidentally left
   * out of the sitemap is invisible, while a page accidentally indexed is a
   * user's financial screen in Google's cache.
   *
   * `app/(public)/layout.tsx` overrides this to `index: true`. Every
   * authenticated and admin route inherits the refusal here and needs no
   * per-page opt-out — which is what stops one forgotten page from leaking.
   */
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F8F7' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1420' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-text"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
