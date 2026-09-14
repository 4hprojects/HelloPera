import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'The terms of using HelloPera — what the service is, what it is not, and what each side is responsible for.',
  alternates: { canonical: `${appUrl()}/terms` },
};

/**
 * /terms — PHASE-10 §48.
 *
 * Written to be read. §48 asks for plain, accurate terms rather than borrowed
 * boilerplate, and for a personal-finance product the two clauses that matter
 * most are the ones people actually need: this is a record-keeping tool, not
 * financial advice, and your data is yours.
 */
const UPDATED = '14 September 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="hp-h2 text-text">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="hp-body text-text-muted">{children}</p>;
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Terms of service</h1>
      <p className="hp-small mt-2 text-text-muted">Last updated {UPDATED}</p>

      <P>
        These terms cover your use of {BRAND.name}. Using the service means accepting
        them.
      </P>

      <Section title="What HelloPera is">
        <P>
          A tool for recording and organising your own financial information. You enter
          what happened; {BRAND.name} keeps it in order and shows you what it adds up to.
        </P>
      </Section>

      <Section title="What HelloPera is not">
        <P>
          It is not financial, tax, investment or legal advice. Figures, forecasts and
          summaries are arithmetic performed on what you entered — they are not
          recommendations, and they do not account for anything you have not recorded.
        </P>
        <P>
          It is not a bank, and it does not move money. Nothing you do here pays a bill or
          transfers funds; recording a payment describes something that happened
          elsewhere.
        </P>
        <P>
          It is not a substitute for your own records. Keep whatever your tax authority,
          employer or accountant requires you to keep.
        </P>
      </Section>

      <Section title="Your account">
        <P>
          You are responsible for keeping your sign-in details private, and for what is
          done through your account.
        </P>
        <P>
          One account is for one person. If you share it, whoever you share it with can
          see everything in it.
        </P>
      </Section>

      <Section title="Your data is yours">
        <P>
          You own the information you put into {BRAND.name}. You can export it at any
          time, and you can delete your account and everything in it.
        </P>
        <P>
          What we do with it while you are here is described in our{' '}
          <Link href="/privacy" className="text-primary-text underline">
            privacy policy
          </Link>
          .
        </P>
      </Section>

      <Section title="Accuracy">
        <P>
          {BRAND.name} reports what you recorded. If a transaction is missing or wrong,
          every total that includes it will be wrong too, and we have no way to know.
        </P>
        <P>
          Automatic document reading is a convenience with an error rate. Nothing it
          suggests becomes a record until you confirm it, and confirming it is your
          decision.
        </P>
      </Section>

      <Section title="Availability">
        <P>
          We aim to keep {BRAND.name} working and your data safe, but we do not promise
          uninterrupted service. Maintenance happens, and so do faults.
        </P>
        <P>Export your data periodically if having an independent copy matters to you.</P>
      </Section>

      <Section title="Acceptable use">
        <P>
          Do not attempt to access another person&rsquo;s data, disrupt the service, or
          use it to break the law. We may suspend an account doing any of those.
        </P>
      </Section>

      <Section title="Changes">
        <P>
          These terms may change as the product does. Material changes will be noted here
          with a new date.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Questions can go to our{' '}
          <Link href="/contact" className="text-primary-text underline">
            contact page
          </Link>
          .
        </P>
      </Section>
    </div>
  );
}
