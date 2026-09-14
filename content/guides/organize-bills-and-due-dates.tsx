import { H2, LI, Note, OL, P, UL } from '@/lib/content/prose';
import type { Article } from '@/lib/content/types';

export const meta = {
  slug: 'organize-bills-and-due-dates',
  title: 'How to organise bills and due dates',
  excerpt:
    'A system for never being surprised by a bill again, built around the fact that you will forget to check.',
  author: 'The HelloPera team',
  publishedAt: '2026-09-14',
  status: 'published' as const,
  category: 'Bills and obligations',
  readingMinutes: 5,
  seoDescription:
    'How to organise recurring bills and due dates so nothing is missed, including what to record and when to check.',
};

export function Body() {
  return (
    <>
      <P>
        Missing a bill is rarely a money problem. It is almost always an attention problem
        — the money was there, and the date simply arrived while you were thinking about
        something else.
      </P>
      <P>
        So the goal is not discipline. It is a system that works when you are not paying
        attention.
      </P>

      <H2>Record the obligation, not the reminder</H2>
      <P>
        A note saying &ldquo;electricity, around the 18th, roughly ₱3,000&rdquo; is better
        than nothing, but it cannot tell you what you owe in total this month, and it
        cannot tell you whether you have already paid.
      </P>
      <P>Record four things for each bill:</P>
      <OL>
        <LI>Who it is to</LI>
        <LI>How much is due</LI>
        <LI>When it is due</LI>
        <LI>Whether it has been paid, and how much of it</LI>
      </OL>
      <P>
        The fourth is what separates a bill list from a to-do list. Partial payments are
        normal — a ₱9,000 bill with ₱4,000 paid is not &ldquo;unpaid&rdquo;, and
        pretending otherwise makes your obligations look worse than they are.
      </P>

      <H2>A bill is not an expense yet</H2>
      <P>
        This matters more than it sounds. Knowing ₱1,799 is due on the 8th is planning
        information. The money is still yours until it leaves.
      </P>
      <P>
        If your tracker counts an unpaid bill as spending, two things break: this month
        looks more expensive than it was, and when you actually pay, it gets counted
        again.
      </P>
      <Note>
        The bill is the promise. The payment is the money moving. Track both, and link
        them when the payment happens.
      </Note>

      <H2>Group by rhythm, not by size</H2>
      <P>
        Most bills fall into three groups, and they need different amounts of attention:
      </P>
      <UL>
        <LI>
          <strong>Fixed and predictable</strong> — rent, internet, a subscription. Same
          amount, same date. Set these up once as recurring and stop thinking about them.
        </LI>
        <LI>
          <strong>Regular but variable</strong> — electricity, water, groceries. Same
          rhythm, different amount. These need a glance each cycle, because the amount is
          the information.
        </LI>
        <LI>
          <strong>Occasional</strong> — insurance, tuition, annual fees. Easy to forget
          precisely because they are rare. These are the ones worth recording the moment
          you learn about them.
        </LI>
      </UL>

      <H2>Check on a schedule you will actually keep</H2>
      <P>
        Once a week is plenty. Pick a day, look at what is due in the next fortnight, and
        make sure the money will be there.
      </P>
      <P>
        Two weeks is the useful window: long enough to do something about a shortfall —
        move money, delay a purchase, chase someone who owes you — and short enough that
        the list is not overwhelming.
      </P>

      <H2>What to do about the one you already missed</H2>
      <P>
        Record it anyway, with its real due date. An overdue bill you can see is a problem
        you can solve. An overdue bill you have hidden from your own records keeps being a
        surprise every time it resurfaces.
      </P>
    </>
  );
}

const article: Article = { ...meta, Body };
export default article;
