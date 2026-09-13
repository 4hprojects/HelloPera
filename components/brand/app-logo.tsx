import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

/**
 * HelloPera lockup — the real mark from image/HelloPeraIcon.png, beside a
 * live-text wordmark.
 *
 * The mark is raster because that is the form the brand art exists in;
 * `public/icons/icon-192.png` is the smallest generated cut, so a 28px logo
 * does not pull a 913 KB source through the optimiser. Regenerate with
 * `node scripts/build-icons.mjs`.
 *
 * The wordmark stays as text rather than shipping the lockup raster: it keeps
 * its own colour tokens on the dark rail, it scales without a second asset,
 * and it is selectable and searchable. Its colours follow the UI palette
 * (jade), not the logo art (grass green) — the showcase makes the same
 * substitution, and docs/DESIGN-SYSTEM.md §3.4 records why.
 *
 * `tone="onDark"` is for the navigation rail, where the ground is Deep Ink
 * and the light-theme text token would vanish into it.
 */
export function AppLogo({
  size = 'md',
  tone = 'default',
  withWordmark = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'onDark';
  withWordmark?: boolean;
  className?: string;
}) {
  const text = {
    sm: 'text-[1.0625rem]',
    md: 'text-[1.375rem]',
    lg: 'text-[1.75rem]',
  }[size];
  const mark = { sm: 24, md: 30, lg: 38 }[size];

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <BrandMark size={mark} />
      {withWordmark ? (
        <span className={cn(text, 'font-extrabold leading-none tracking-tight')}>
          <span className={tone === 'onDark' ? 'text-nav-text' : 'text-text'}>Hello</span>
          <span className={tone === 'onDark' ? 'text-primary-soft' : 'text-primary-text'}>
            Pera
          </span>
        </span>
      ) : null}
      {/* Only when the wordmark is hidden — otherwise a screen reader hears
          the name twice. */}
      {withWordmark ? null : <span className="sr-only">HelloPera</span>}
    </span>
  );
}

/**
 * The wallet mark on its own. Decorative wherever the wordmark sits beside it,
 * which is everywhere it currently appears.
 */
export function BrandMark({
  size = 30,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/icons/icon-192.png"
      alt=""
      width={size}
      height={size}
      priority
      className={cn('shrink-0', className)}
    />
  );
}
