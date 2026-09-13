import Link from 'next/link';
import { BRAND } from '@/lib/constants/brand';

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="hp-small text-text-muted">
          © {new Date().getFullYear()} {BRAND.name}
        </p>
        <nav aria-label="Footer" className="flex gap-4">
          <Link href="/privacy" className="hp-small text-text-muted hover:text-text">
            Privacy
          </Link>
          <Link href="/terms" className="hp-small text-text-muted hover:text-text">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
