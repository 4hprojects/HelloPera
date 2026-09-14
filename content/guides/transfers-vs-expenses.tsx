import { H2, LI, Note, P, UL } from '@/lib/content/prose';
import type { Article } from '@/lib/content/types';

export const meta = {
  slug: 'transfers-vs-expenses',
  title: 'How to separate transfers from expenses',
  excerpt:
    'Moving money between your own accounts is not spending. Here is why trackers get this wrong, and what it does to your totals.',
  author: 'The HelloPera team',
  publishedAt: '2026-09-14',
  status: 'published' as const,
  category: 'Getting started',
  readingMinutes: 5,
  seoDescription:
    'Why transfers between your own accounts must not count as expenses, and how to record credit card payments and e-wallet top-ups correctly.',
};

export function Body() {
  return (
    <>
      <P>
        This is the single most common reason a personal tracker reports spending that
        feels far too high. It is worth understanding properly, because once the
        distinction is clear it stays clear.
      </P>

      <H2>The rule</H2>
      <P>
        Money moving between two accounts you own is a <strong>transfer</strong>. Your
        total wealth has not changed — one balance went down and another went up by the
        same amount. Nothing was spent.
      </P>
      <P>
        Money leaving your accounts entirely, to someone else, is an{' '}
        <strong>expense</strong>. That is the only kind of movement that makes you poorer.
      </P>

      <H2>Where it goes wrong</H2>
      <P>Three situations catch people out, and all three are common in daily life.</P>

      <H2>Topping up an e-wallet</H2>
      <P>
        You move ₱3,000 from your bank to GCash. If that is recorded as an expense, your
        month shows ₱3,000 of spending that never happened — and then when you actually
        spend the ₱3,000, it gets counted a second time. One top-up, double-counted.
      </P>
      <Note>
        A useful check: if the money is still yours afterwards, it was not an expense.
      </Note>

      <H2>Paying a credit card bill</H2>
      <P>
        This one is genuinely confusing, because it feels like paying. But you already
        recorded the expense when you bought the thing — that is the moment the money was
        committed and the moment the category was decided.
      </P>
      <P>
        The card payment is a transfer that settles a debt: your bank balance goes down,
        and what you owe on the card goes down by the same amount. Recording it as an
        expense counts every card purchase twice.
      </P>
      <UL>
        <LI>
          <strong>Buying a ₱2,000 jacket on the card:</strong> an expense, dated when you
          bought it, categorised as clothing.
        </LI>
        <LI>
          <strong>Paying ₱2,000 off the card later:</strong> a transfer, which reduces
          both your bank balance and your debt.
        </LI>
      </UL>

      <H2>Withdrawing cash</H2>
      <P>
        Taking ₱2,000 out of an ATM moves money from your bank account to your wallet.
        Both are yours. The expense happens later, when the cash is actually spent.
      </P>
      <P>
        If you would rather not track cash purchase by purchase, that is a reasonable
        trade — but then record the withdrawal as spending and accept that you will not
        know what the cash went on. What you must not do is record both the withdrawal and
        the purchases, which counts the same money twice.
      </P>

      <H2>How to tell, quickly</H2>
      <P>Ask one question: after this movement, do I still have the money?</P>
      <UL>
        <LI>Still mine, somewhere else → transfer.</LI>
        <LI>Gone to someone else → expense.</LI>
        <LI>Came from someone else → income.</LI>
      </UL>
      <P>
        Paying down a loan or a card is the case that feels like an exception and is not.
        The money left your account, but it cancelled a debt of the same size, so your
        overall position is unchanged. That is a transfer between an account you own and a
        debt you owe.
      </P>
    </>
  );
}

const article: Article = { ...meta, Body };
export default article;
