import { Card } from '@/components/ui/card';

/**
 * The narrow auth column — for pages with no marketing panel.
 *
 * `/forgot-password`, `/reset-password` and `/verify-email` are all things a
 * person does *while already trying to get in*. A marketing panel there would
 * be selling to someone who has already bought, and it would push the one
 * field they came for further down the page.
 *
 * They previously relied on a `max-w-sm` wrapper in the auth layout. That
 * wrapper had to go when `/register` and `/login` grew to a full-width split
 * card, so the constraint lives here instead — explicit, and owned by the
 * pages that actually want it.
 */
export function AuthColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <Card className="p-6 sm:p-7">{children}</Card>
    </div>
  );
}
