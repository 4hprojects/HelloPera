import Link from 'next/link';
import { AppLogo } from '@/components/brand/app-logo';
import { SiteFooter } from '@/components/layout/site-footer';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { publicNav } from '@/lib/constants/navigation';
import { buttonClass } from '@/components/ui/button';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="rounded">
            <AppLogo />
          </Link>
          <nav aria-label="Site" className="hidden gap-5 sm:flex">
            {publicNav.slice(1).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hp-small text-text-muted hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className={buttonClass('primary', 'sm', 'hidden sm:inline-flex')}
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
