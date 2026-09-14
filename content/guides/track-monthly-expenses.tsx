import { H2, LI, Note, OL, P, UL } from '@/lib/content/prose';
import type { Article } from '@/lib/content/types';

export const meta = {
  slug: 'how-to-track-monthly-expenses',
  title: 'How to track monthly expenses without giving up in week two',
  excerpt:
    'Most expense tracking fails for the same three reasons. Here is a method that survives a busy month.',
  author: 'The HelloPera team',
  publishedAt: '2026-09-14',
  status: 'published' as const,
  category: 'Getting started',
  readingMinutes: 6,
  seoDescription:
    'A practical method for tracking monthly expenses that survives a busy month, including what to do when you fall behind.',
};

export function Body() {
  return (
    <>
      <P>
        Almost everyone who starts tracking expenses stops within a month. It is rarely
        because the maths is hard. It is because the method asked for more attention than
        an ordinary week has to spare, and one missed day turned into a backlog nobody
        wants to face.
      </P>
      <P>
        The method below is built around that failure rather than pretending it will not
        happen.
      </P>

      <H2>Start with accounts, not categories</H2>
      <P>
        The instinct is to design a perfect category list first. Resist it. Categories are
        a reporting decision and you can change them whenever you like. Accounts are the
        thing that has to match reality.
      </P>
      <P>
        List the places your money actually sits: your bank, your cash, your e-wallet,
        your credit card. If money can move in or out of it, it is an account. Set each
        one&rsquo;s opening balance to what it holds today — not what it held in January.
      </P>
      <Note>
        Getting the opening balances right on day one is what makes every later total
        trustworthy. It is worth ten minutes.
      </Note>

      <H2>Record the transaction, not the receipt</H2>
      <P>
        A common trap is treating tracking as a filing exercise: collect receipts, enter
        them later, fall behind, quit. The receipt is evidence. The transaction is the
        fact you care about.
      </P>
      <P>
        Record the amount, the date, the account it left, and roughly what it was for.
        Four fields. If you have the receipt and want it attached, attach it — but never
        let a missing receipt stop you recording that the money moved.
      </P>

      <H2>Three rules that prevent most confusion</H2>
      <OL>
        <LI>
          <strong>A transfer is not an expense.</strong> Moving ₱5,000 from your bank to
          your e-wallet does not make you ₱5,000 poorer. If your tracker counts it as
          spending, your monthly total is fiction.
        </LI>
        <LI>
          <strong>A bill is not an expense until you pay it.</strong> Knowing that ₱1,799
          is due on the 8th is useful, but the money is still yours until it leaves. Track
          the obligation separately from the payment.
        </LI>
        <LI>
          <strong>A refund belongs to the original purchase.</strong> Returning a ₱3,000
          pair of shoes is not ₱3,000 of income. It reduces what you spent on clothing
          that month, which is a different sentence with a different meaning.
        </LI>
      </OL>

      <H2>What to do when you fall behind</H2>
      <P>
        You will fall behind. A week will disappear and you will have eleven unrecorded
        purchases and no memory of four of them.
      </P>
      <P>Do not try to reconstruct the week. Instead:</P>
      <UL>
        <LI>Record the ones you remember, with their real dates.</LI>
        <LI>
          Check each account&rsquo;s balance against reality, and record a single
          adjustment for the difference.
        </LI>
        <LI>Carry on from today.</LI>
      </UL>
      <P>
        An adjustment is not an admission of failure — it is how you keep the balances
        honest without spending an evening on archaeology. A tracker that is accurate from
        today is far more useful than one you abandoned because March was messy.
      </P>

      <H2>Review once a month, not once a day</H2>
      <P>
        Daily recording, monthly reviewing. Checking your totals every day tells you
        nothing — spending is lumpy, and a Tuesday means very little on its own.
      </P>
      <P>
        At the end of the month, look at three things: what came in, what went out, and
        which two or three categories were larger than you expected. That last one is
        where the useful surprises live, and it is the only part that reliably changes
        behaviour.
      </P>
    </>
  );
}

const article: Article = { ...meta, Body };
export default article;
