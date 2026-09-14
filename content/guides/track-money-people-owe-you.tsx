import { H2, LI, Note, P, UL } from '@/lib/content/prose';
import type { Article } from '@/lib/content/types';

export const meta = {
  slug: 'track-money-people-owe-you',
  title: 'How to track money people owe you',
  excerpt:
    'Lending to friends and invoicing clients are the same accounting problem. Neither is income until it arrives.',
  author: 'The HelloPera team',
  publishedAt: '2026-09-14',
  status: 'published' as const,
  category: 'Bills and obligations',
  readingMinutes: 5,
  seoDescription:
    'How to track receivables — money friends, family or clients owe you — without counting it as income before it arrives.',
};

export function Body() {
  return (
    <>
      <P>
        Money owed to you is easy to lose track of, for a reason that has nothing to do
        with bookkeeping: asking about it is uncomfortable, so we avoid looking at it, and
        then we genuinely forget.
      </P>
      <P>
        Writing it down is partly an accounting act and partly a way of not having to hold
        it in your head.
      </P>

      <H2>It is not income until it arrives</H2>
      <P>
        This is the rule that matters most. A ₱15,000 invoice you sent last week is not
        ₱15,000 of income. It is a claim, and claims sometimes do not pay.
      </P>
      <P>
        If your tracker counts it as income when you send it, your monthly totals describe
        money you do not have — and if the client never pays, you have to go back and
        unpick a figure you have already relied on.
      </P>
      <Note>
        Record what you are owed separately from what you have received. When the money
        lands, link the two.
      </Note>

      <H2>The same shape, three situations</H2>
      <UL>
        <LI>
          <strong>A friend borrowed ₱2,000.</strong> No due date, no invoice, but it is
          still money you expect back.
        </LI>
        <LI>
          <strong>A client owes ₱15,000 on 30-day terms.</strong> A due date and an
          expectation of being chased if it slips.
        </LI>
        <LI>
          <strong>You paid for a group dinner.</strong> Four people owe you a share.
          Small, and the most likely to be forgotten entirely.
        </LI>
      </UL>
      <P>
        All three are the same record: who, how much, when you expect it, and how much has
        come back so far.
      </P>

      <H2>Partial payments are the normal case</H2>
      <P>
        People pay in pieces. A client sends half now and half on delivery; a friend gives
        you ₱500 back when they can.
      </P>
      <P>
        A record that only knows &ldquo;paid&rdquo; and &ldquo;unpaid&rdquo; forces you to
        round — and rounding down means forgetting money, while rounding up means chasing
        someone for what they have already sent. Track the remaining amount, and the
        awkward conversation becomes a factual one.
      </P>

      <H2>Decide what it means to give up</H2>
      <P>
        Some of it will not come back. The ₱300 from a dinner two years ago is not worth
        another message.
      </P>
      <P>
        Close those records deliberately rather than letting them sit forever. A
        receivables list you have stopped believing is one you have stopped reading, and
        then the ₱15,000 invoice hides among the ₱300 dinners.
      </P>

      <H2>Keep it out of your forecast unless you are confident</H2>
      <P>
        When projecting what you will have next month, money owed to you is the least
        certain input. A bill has a date and a fixed amount; a receivable has a date and a
        hope.
      </P>
      <P>
        Plan without it, and treat it as upside when it arrives. That way a late payment
        is an inconvenience rather than a shortfall.
      </P>
    </>
  );
}

const article: Article = { ...meta, Body };
export default article;
