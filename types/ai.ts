import type { Money } from '@/lib/money';
import type { AiIntent } from '@/schemas/ai.schema';

/**
 * The assistant's view model — PHASE-12 §50, §68.
 *
 * No `server-only` import, so the executors, the deterministic templates, the
 * explanation prompt and the components can all speak the same shape.
 *
 * This type is the answer to §24 ("No Hallucinated Figures"). Every number the
 * user sees is a `Money` that came out of an executor, and the explanation call
 * receives this object and nothing else (§50) — no rows, no OCR text, no raw
 * database payloads. The model writes sentences around figures it was handed;
 * it never produces one.
 */

/** A headline number, already labelled. */
export type AiFigure = {
  label: string;
  amount: Money;
};

/** One row of a breakdown — a category, an account, a bill, a transaction. */
export type AiItem = {
  label: string;
  amount: Money;
  /** YYYY-MM-DD where the row has a date of its own. */
  date?: string | null;
  /** A status word or secondary detail. Never colour alone (Phase 00 §7). */
  hint?: string | null;
};

export type AiAnswerResult = {
  intent: AiIntent;
  range: { from: string; to: string; label: string };
  /** §32 — one currency, never a mixture. */
  currency: string;
  figures: AiFigure[];
  /** §48 — already capped by the executor, never the full set. */
  items: AiItem[];
  /** More rows existed than were returned, so §49 can offer the real page. */
  truncated: boolean;
  comparison: { label: string; figures: AiFigure[] } | null;
  /**
   * §69, §70 — where to see this in the app.
   *
   * A link rather than more rows: "show all" belongs on the transactions page
   * with its filters, not pushed into a model's context window.
   */
  href: string | null;
  hrefLabel: string | null;
  /**
   * §25 — genuinely no data, as distinct from a total of zero.
   *
   * These are different answers and conflating them is uniquely bad in a
   * finance app: "you spent ₱0 on food" and "you have not recorded any food
   * spending" mean opposite things to someone deciding whether to trust the
   * number.
   */
  empty: boolean;
  /** §16, §35, §45 — what the answer assumed, stated plainly. */
  assumptions: string[];
};
