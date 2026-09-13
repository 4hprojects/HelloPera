import Link from 'next/link';
import { AppLogo } from '@/components/brand/app-logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="px-4 py-5">
        <Link href="/" className="inline-flex rounded">
          <AppLogo />
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
