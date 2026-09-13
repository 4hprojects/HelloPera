import { cn } from '@/lib/utils/cn';

/**
 * Decorative motifs from the showcase's "Illustration Style" panel — leaves
 * and coins, standing for growth.
 *
 * These are ornament, not identity: the brand mark is the wallet in
 * components/brand/app-logo.tsx. Everything here is `aria-hidden` and must
 * never be the only way to read something.
 */

export function LeafMark({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path
        d="M20.5 3.5C11 3 4.5 7 4.5 13.6c0 2.3.9 4.3 2.3 5.6C9.4 16.4 13 13.7 17.6 12c-3.8 2.6-6.7 5.5-8.6 8.6 1 .4 2 .6 3.1.6 5.4 0 8.9-4.7 8.9-11.4 0-2.4-.2-4.5-.5-6.3z"
        fill="var(--hp-primary-soft)"
      />
      <path
        d="M20.5 3.5c-4.7 3.6-9.6 8.8-13.7 15.7"
        stroke="var(--hp-primary)"
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Stacked coins — the growth motif from the showcase's promo panel. */
export function CoinStack({
  size = 56,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(0 ${38 - i * 10})`}>
          <ellipse cx="28" cy="10" rx="18" ry="7" fill="var(--hp-gold)" />
          <ellipse cx="28" cy="8" rx="18" ry="7" fill="#e2b565" />
        </g>
      ))}
    </svg>
  );
}
