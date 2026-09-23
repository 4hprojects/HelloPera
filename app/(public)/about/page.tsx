import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { BRAND } from '@/lib/constants/brand';
import { buttonClass } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why HelloPera exists, what it is built around, and what it deliberately does not do.',
  alternates: { canonical: `${appUrl()}/about` },
};

/**
 * /about — PHASE-10 §16.
 *
 * §16 asks for a real explanation rather than a mission statement. The most
 * useful thing an about page can say about a finance tool is what it refuses
 * to do, because that is what distinguishes it from every other tracker.
 */
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">About {BRAND.name}</h1>

      <p className="hp-body mt-4 text-text-muted">
        {BRAND.name} is a personal finance tracker built for people who want to know where
        their money actually goes, without adopting an accounting system to find out.
      </p>

      <h2 className="hp-h2 mt-8 text-text">Why it exists</h2>
      <p className="hp-body mt-3 text-text-muted">
        Most personal finance tools are built around bank connections. In the Philippines,
        that leaves out the parts of daily life that matter most — cash, an e-wallet, a
        friend who owes you for dinner, a client who pays in two instalments.
      </p>
      <p className="hp-body mt-3 text-text-muted">
        {BRAND.name} is built for money that moves through several places at once, and for
        records you keep by hand because no bank will keep them for you.
      </p>

      <h2 className="hp-h2 mt-8 text-text">What it is built around</h2>
      <p className="hp-body mt-3 text-text-muted">
        Three distinctions, applied everywhere. A document is not a record. A bill is not
        an expense. A forecast is not a promise.
      </p>
      <p className="hp-body mt-3 text-text-muted">
        Uploading a receipt does not change your balances. Owing ₱1,799 is not the same as
        having paid it. And a projection is arithmetic on what you have told us, shown
        with its inputs so you can disagree with it.
      </p>

      <h2 className="hp-h2 mt-8 text-text">What it does not do</h2>
      <p className="hp-body mt-3 text-text-muted">
        It does not give financial advice. It does not move money. It does not guess at a
        number and present it as fact, and it does not convert between currencies —
        because an invented exchange rate in a balance is worse than no balance at all.
      </p>
      <p className="hp-body mt-3 text-text-muted">
        Automatic document reading is planned for a later release. When enabled, it
        suggests; you confirm. Nothing extracted from an image becomes a financial record
        on its own.
      </p>

      <h2 className="hp-h2 mt-8 text-text">Where it is going</h2>
      <p className="hp-body mt-3 text-text-muted">
        {BRAND.name} is built in stages, and each one ships only when it works. You can
        see what exists today on the{' '}
        <Link href="/features" className="text-primary-text underline">
          features page
        </Link>
        , which lists what is built rather than what is planned.
      </p>

      <div className="mt-8">
        <Link href="/register" className={buttonClass('primary')}>
          Start tracking
        </Link>
      </div>
    </div>
  );
}
