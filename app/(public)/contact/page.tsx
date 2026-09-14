import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'How to reach the HelloPera team about a problem, a question or your data.',
  alternates: { canonical: `${appUrl()}/contact` },
};

/**
 * /contact — PHASE-10 §43, §44.
 *
 * ## Why there is no form here
 *
 * §44 requires spam protection on a contact form, and a form with weak
 * protection is worse than none: it becomes a relay that sends mail on
 * somebody else's behalf, from a domain whose reputation matters for the
 * transactional email the product depends on.
 *
 * Doing it properly means a rate limit (built — `lib/security/rate-limit.ts`
 * already has a `contact` policy), a challenge, and somewhere for messages to
 * land. Until the last of those exists, an address is the honest answer: it
 * works, it cannot be abused into sending mail as us, and it sets no
 * expectation of a ticket number that nothing would issue.
 */
const CONTACT_EMAIL = 'hello@hellopera.online';

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Contact</h1>

      <p className="hp-body mt-4 text-text-muted">Email is the best way to reach us.</p>

      <p className="hp-h3 mt-4">
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary-text underline">
          {CONTACT_EMAIL}
        </a>
      </p>

      <h2 className="hp-h2 mt-10 text-text">Before you write</h2>
      <p className="hp-body mt-3 text-text-muted">
        Many questions are answered in the{' '}
        <Link href="/faq" className="text-primary-text underline">
          FAQ
        </Link>{' '}
        or the{' '}
        <Link href="/help" className="text-primary-text underline">
          help page
        </Link>
        — particularly about costs, bank connections and what happens to uploaded
        documents.
      </p>

      <h2 className="hp-h2 mt-10 text-text">If something is wrong with your data</h2>
      <p className="hp-body mt-3 text-text-muted">
        Tell us what you expected to see and what you saw instead. Please do not send
        screenshots containing account numbers or balances — describe the problem and we
        will ask for what we need.
      </p>

      <h2 className="hp-h2 mt-10 text-text">Your data</h2>
      <p className="hp-body mt-3 text-text-muted">
        You do not need to contact anyone to export or delete your information — both are
        in your settings, and both work immediately. What happens to your data is
        described in our{' '}
        <Link href="/privacy" className="text-primary-text underline">
          privacy policy
        </Link>
        .
      </p>

      <p className="hp-small mt-10 text-text-muted">
        {BRAND.name} is a small project. Replies are not instant, but they are from a
        person.
      </p>
    </div>
  );
}
