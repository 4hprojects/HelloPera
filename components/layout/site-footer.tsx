import Link from 'next/link';
import { BRAND } from '@/lib/constants/brand';
import { footerRoutes } from '@/lib/seo/routes';

/**
 * §11, §36 — footer navigation from the route registry.
 *
 * Previously a hardcoded pair of links to Privacy and Terms, which is how
 * /pricing came to exist as a page that nothing linked to. Driving both the
 * header and the footer from one list means a new public route is reachable by
 * being registered, not by being remembered twice.
 *
 * §36 also treats the footer as real internal linking rather than decoration:
 * it is the one place every page links to every other, which matters for
 * crawlability on a small site.
 */
export function SiteFooter() {
  const routes = footerRoutes();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="hp-small text-text-muted">
          © {new Date().getFullYear()} {BRAND.name}
        </p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-1">
          {routes.map((route) => (
            <Link
              key={route.path}
              href={route.path}
              className="inline-flex min-h-11 items-center hp-small text-text-muted hover:text-text"
            >
              {route.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
