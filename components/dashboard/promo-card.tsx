import { CoinStack, LeafMark } from '@/components/brand/motifs';
import { ArrowRightIcon } from '@/components/icons';
import { BRAND } from '@/lib/constants/brand';

/**
 * "More than a tracker. A brighter financial future." — the sand-ground promo
 * panel at the foot of the showcase's phone mock.
 *
 * It links to /features rather than a paywall: Phase 09 owns tiers, and a
 * card that promises an upgrade nobody can buy yet is a dead end.
 */
export function PromoCard() {
  return (
    <a
      href="/features"
      className="relative flex items-center gap-4 overflow-hidden rounded-2xl bg-sand p-5 text-on-sand transition-opacity hover:opacity-95"
    >
      <CoinStack className="relative hidden sm:block" />
      <LeafMark
        size={120}
        className="pointer-events-none absolute -right-4 -top-6 opacity-20"
      />

      <span className="relative min-w-0 flex-1">
        <span className="block text-base font-bold leading-snug">
          More than a tracker.{' '}
          <span className="text-on-sand-accent">A brighter financial future.</span>
        </span>
        <span className="hp-small mt-1 block opacity-80">{BRAND.promiseSub}</span>
      </span>

      <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-fill text-on-primary">
        <ArrowRightIcon size={18} />
        <span className="sr-only">See what HelloPera does</span>
      </span>
    </a>
  );
}
