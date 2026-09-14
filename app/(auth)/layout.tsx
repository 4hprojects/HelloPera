import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

/**
 * The authentication shell.
 *
 * A centred card that individual pages fill: `/register` and `/login` render a
 * marketing panel beside their form via `AuthShell`, while the narrower pages
 * (forgot password, verify email) use `AuthColumn`. Both live inside the same
 * outer frame so the surfaces do not drift apart.
 *
 * It now carries the same header and footer as the public site. Someone who
 * arrives at sign-up from a search result could previously reach nothing —
 * no Features, no Pricing, no Guides, and no Privacy or Terms, which is
 * exactly what a person looks for before handing over an email address.
 *
 * The header derives its own account button from the pathname, so `/register`
 * offers Sign in and `/login` offers Get started — never a link to the page
 * you are already on.
 *
 * This layout deliberately does NOT re-export the `(public)` group's
 * `metadata.robots` override, so these routes keep the root layout's
 * `noindex` — `/register` and `/login` are in `DISALLOWED_PREFIXES`.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader />

      <main id="main" className="flex flex-1 items-start justify-center px-4 py-10">
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}
