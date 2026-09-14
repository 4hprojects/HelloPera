import Link from 'next/link';
import { AppLogo } from '@/components/brand/app-logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * The authentication shell.
 *
 * A centred card that individual pages fill: `/register` and `/login` render a
 * marketing panel beside their form via `AuthShell`, while the narrower pages
 * (forgot password, verify email) use the plain column. Both live inside the
 * same outer frame so the surfaces do not drift apart.
 *
 * The logo header is `lg:hidden`: on a wide screen the split-screen panel
 * already carries the mark, and showing it twice looks like a mistake.
 *
 * The theme toggle is new here. Every other surface has one, and arriving at
 * sign-in to find the control missing reads as a broken page rather than a
 * deliberate omission.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-5">
        <Link href="/" className="inline-flex rounded lg:invisible">
          <AppLogo />
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16">
        {children}
      </main>
    </div>
  );
}
