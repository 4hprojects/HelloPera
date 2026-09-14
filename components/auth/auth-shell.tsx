import { AuthPanel } from '@/components/auth/auth-panel';

/**
 * The split-screen card — PHASE-01, and the structure helloRun's signup uses.
 *
 * A single card containing a marketing panel and a form, which on a wide
 * screen sit side by side and on a narrow one stack. Not a wizard: one step,
 * everything visible, no hidden progress.
 *
 * ## Spacing is comfortable, not compact
 *
 * helloRun's equivalent uses 4px field gaps and 43px inputs to force seven
 * fields above the fold — and its own narrowest breakpoint quietly undoes that
 * by pushing inputs back to 48px for touch. Rather than inherit a compromise,
 * the form here keeps the product's normal rhythm and is allowed to scroll.
 * Nobody abandons a signup because it was two hundred pixels tall.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  /** The marketing headline. The form's own heading lives in `children`. */
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgba(19,34,56,0.04),0_18px_48px_-20px_rgba(19,34,56,0.18)] lg:flex">
        <AuthPanel title={title} subtitle={subtitle} />

        <div className="p-6 sm:p-8 lg:flex-1">
          <div className="mx-auto w-full max-w-sm">{children}</div>
        </div>
      </div>
    </div>
  );
}
