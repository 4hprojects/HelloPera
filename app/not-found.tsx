import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

/**
 * 404 — PHASE-10 §74.
 *
 * §74 asks for a useful 404 rather than a dead end. The links below are the
 * four places a lost visitor actually wants, and the page is `noindex` by
 * inheritance from the root layout — a 404 in a search index is worse than no
 * result.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16 text-center">
      <p className="hp-label text-text-muted">404</p>
      <h1 className="hp-h1 mt-2 text-text">We could not find that page</h1>
      <p className="hp-body mt-3 text-text-muted">
        It may have moved, or the link may be wrong. Nothing has happened to your account.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className={buttonClass('primary', 'sm')}>
          Home
        </Link>
        <Link href="/guides" className={buttonClass('secondary', 'sm')}>
          Guides
        </Link>
        <Link href="/help" className={buttonClass('ghost', 'sm')}>
          Help
        </Link>
        <Link href="/dashboard" className={buttonClass('ghost', 'sm')}>
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
