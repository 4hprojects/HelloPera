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
  // Phase 00 is not public. Phase 10 owns indexing, and until then nothing
  // here should be discoverable.
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
