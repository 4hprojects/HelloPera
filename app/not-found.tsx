import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 text-center"
    >
      <p className="hp-label text-text-muted">404</p>
      <h1 className="hp-h1 mt-2 text-text">Page not found</h1>
      <p className="hp-body mt-2 text-text-muted">
        That page doesn&apos;t exist, or it hasn&apos;t been built yet.
      </p>
      <div className="mt-6">
        <Link href="/" className={buttonClass('primary', 'md')}>
          Go home
        </Link>
      </div>
    </main>
  );
}
