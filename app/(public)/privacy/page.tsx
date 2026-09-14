import type { Metadata } from 'next';
import Link from 'next/link';
import { appUrl } from '@/lib/env';
import { BRAND } from '@/lib/constants/brand';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'What HelloPera stores, how documents and OCR are processed, how advertising works, and how to export or delete everything.',
  alternates: { canonical: `${appUrl()}/privacy` },
};

/**
 * /privacy — PHASE-10 §45, §46, §47, criterion 23.
 *
 * Criterion 23 is the constraint that shaped this page: it must describe
 * *"only deletion and retention that actually work"*. So every claim below
 * corresponds to something built and verified:
 *
 *  - Export → `/settings/data`, paged so it cannot silently truncate.
 *  - Deletion → `/settings/delete`, verified to clear every user-owned table.
 *  - The surviving audit record → `audit_logs.actor_user_id` is `on delete set
 *    null`, so the row persists with no user attached.
 *  - OCR → Anthropic, only when the user asks for it.
 *  - Advertising → not running; `ads_enabled_global` is false.
 *
 * Nothing here is aspirational. If a claim stops being true, this page is
 * wrong and must change with it.
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="hp-h1 text-text">Privacy</h1>
      <p className="hp-small mt-2 text-text-muted">Last updated {UPDATED}</p>

      <P>
        {BRAND.name} holds financial records people would not want made public. This page
        describes what is stored, who can reach it, and what happens when you ask for it
        back or ask us to delete it.
      </P>

      <Section title="What we store">
        <P>
          The account details you sign up with — your email address, and your name if you
          give one.
        </P>
        <P>
          The financial records you create: accounts and balances, transactions, bills,
          receivables, expected income, categories and recurring rules.
        </P>
        <P>
          Documents you upload, such as receipts and statements, along with the text
          extracted from them.
        </P>
        <P>
          A limited operational record: when you signed in, when settings changed, and
          when scheduled jobs ran. This exists so we can answer questions about what
          happened to an account.
        </P>
      </Section>

      <Section title="Who can see it">
        <P>
          Your records are readable only by you. The database enforces this at row level,
          not merely in the application, so a bug in a screen cannot expose another
          person&rsquo;s data.
        </P>
        <P>
          Administrators can see operational information — how many accounts exist,
          whether scheduled jobs succeeded, how many documents were processed. They cannot
          browse your balances, transactions or documents.
        </P>
      </Section>

      <Section title="Documents and OCR">
        {/* §46 — the disclosure this section exists for. */}
        <P>
          When you ask {BRAND.name} to read a document, the file is sent to Anthropic,
          which extracts the text and the details it can find. This happens only when you
          request it — uploading a document does not send it anywhere by itself.
        </P>
        <P>
          Nothing extracted from a document changes your records until you review and
          confirm it. Automatic extraction is a suggestion, never an entry.
        </P>
        <P>
          Images are stripped of embedded metadata, including location data, before they
          are stored.
        </P>
      </Section>

      <Section title="Advertising">
        {/* §47 — the disclosure. Present tense, and currently "no ads". */}
        <P>
          {BRAND.name} does not currently show advertising. If that changes, ads will
          appear only on the public website and general application screens — never
          alongside your balances, your transactions or a document you are reviewing.
        </P>
        <P>
          Your financial records are never shared with advertisers, and never used to
          target an advertisement.
        </P>
      </Section>

      <Section title="Analytics">
        <P>
          We do not send your financial data to any analytics service. If we measure
          anything, it is which public pages are visited — never amounts, balances,
          merchants or document contents.
        </P>
      </Section>

      <Section title="Getting your data back">
        <P>
          You can export everything at any time from your settings, as CSV or JSON. The
          export includes your accounts, transactions, bills, receivables, expected
          income, categories, recurring rules and the details of your documents.
        </P>
        <P>
          The files you uploaded are not inside the export — download those from the
          Documents screen while your account is open.
        </P>
      </Section>

      <Section title="Deleting your account">
        <P>
          You can delete your account from your settings. It asks for your password and a
          typed confirmation, because it cannot be undone.
        </P>
        <P>
          Deleting removes your profile, every financial record listed above, and every
          file you uploaded. We keep no copy you can ask for later.
        </P>
        <P>
          One record survives: a dated note that an account was deleted, with no financial
          information and no name attached. It exists so we can answer questions about
          deletions, and for nothing else.
        </P>
      </Section>

      <Section title="Where your data is held">
        <P>
          {BRAND.name} stores data with Supabase. Document reading is performed by
          Anthropic. Both process data on our instructions and for no other purpose.
        </P>
      </Section>

      <Section title="Changes to this page">
        <P>
          If what we do changes, this page changes with it. We will not describe a
          practice here that is not actually in place.
        </P>
      </Section>

      <Section title="Contact">
        <P>
          Questions about any of this can go to our{' '}
          <Link href="/contact" className="text-primary-text underline">
            contact page
          </Link>
          .
        </P>
      </Section>
    </div>
  );
}
