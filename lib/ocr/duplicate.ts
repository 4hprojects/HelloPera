import { parseDecimal } from '@/lib/money';

/**
 * Duplicate candidate scoring — Phase 05 §49–52.
 *
 * The job is to ask "is this the receipt for something you already recorded?"
 * before creating a second transaction for one purchase.
 *
 * It NEVER merges automatically (§51). A false positive that silently merges
 * two genuine transactions is unrecoverable without an audit trail; a false
 * positive that asks a question costs one tap.
 */

export type DuplicateSignal =
  | 'same_document_hash'
  | 'same_reference'
  | 'same_amount'
  | 'same_date'
  | 'near_date'
  | 'same_merchant';

/** Weights from §51. Reference and document hash are near-certain; the rest corroborate. */
const WEIGHTS: Record<DuplicateSignal, number> = {
  same_document_hash: 100,
  same_reference: 70,
  same_amount: 30,
  same_date: 20,
  near_date: 10,
  same_merchant: 20,
};

export type CandidateInput = {
  amount: string | null;
  currency: string | null;
  date: string | null;
  merchant: string | null;
  reference: string | null;
  documentHash: string | null;
};

export type ExistingRecord = {
  id: string;
  amount: string;
  currency: string;
  date: string;
  merchant: string | null;
  reference: string | null;
  documentHash: string | null;
};

export type DuplicateCandidate = {
  id: string;
  score: number;
  signals: DuplicateSignal[];
};

/** Merchant names vary ("SM Supermalls" vs "SM SUPERMALLS #123"). Normalise, don't cluster (§31). */
export function normaliseMerchant(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function sameAmount(a: string | null, b: string): boolean {
  if (!a) return false;
  try {
    // Compare as exact minor units — "100.00" and "100" are the same money.
    return parseDecimal(a) === parseDecimal(b);
  } catch {
    return false;
  }
}

function daysApart(a: string | null, b: string): number | null {
  if (!a) return null;
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.abs(Math.round((t1 - t2) / 86_400_000));
}

/** Score >= this is worth showing the user. */
export const CANDIDATE_THRESHOLD = 40;

export function scoreCandidate(
  input: CandidateInput,
  existing: ExistingRecord,
): DuplicateCandidate | null {
  // Different currencies are never the same payment — HelloPera does not convert.
  if (input.currency && existing.currency && input.currency !== existing.currency) {
    return null;
  }

  const signals: DuplicateSignal[] = [];

  if (input.documentHash && input.documentHash === existing.documentHash) {
    signals.push('same_document_hash');
  }
  if (
    input.reference &&
    existing.reference &&
    input.reference.trim() === existing.reference.trim()
  ) {
    signals.push('same_reference');
  }
  if (sameAmount(input.amount, existing.amount)) signals.push('same_amount');

  const gap = daysApart(input.date, existing.date);
  if (gap === 0) signals.push('same_date');
  // Receipts are often dated a day either side of when the bank posted it.
  else if (gap !== null && gap <= 2) signals.push('near_date');

  const a = normaliseMerchant(input.merchant);
  const b = normaliseMerchant(existing.merchant);
  if (a && b && (a === b || a.includes(b) || b.includes(a)))
    signals.push('same_merchant');

  if (signals.length === 0) return null;

  const score = Math.min(
    100,
    signals.reduce((sum, s) => sum + WEIGHTS[s], 0),
  );
  return { id: existing.id, score, signals };
}

export function findCandidates(
  input: CandidateInput,
  existing: readonly ExistingRecord[],
  threshold = CANDIDATE_THRESHOLD,
): DuplicateCandidate[] {
  return existing
    .map((record) => scoreCandidate(input, record))
    .filter((c): c is DuplicateCandidate => c !== null && c.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

const SIGNAL_LABELS: Record<DuplicateSignal, string> = {
  same_document_hash: 'the identical file was already uploaded',
  same_reference: 'the same reference number',
  same_amount: 'the same amount',
  same_date: 'the same date',
  near_date: 'a date within two days',
  same_merchant: 'the same merchant',
};

/** Say WHY, so the user can judge rather than trust a score. */
export function explainCandidate(candidate: DuplicateCandidate): string {
  const reasons = candidate.signals.map((s) => SIGNAL_LABELS[s]);
  if (reasons.length === 1) return `This has ${reasons[0]}.`;
  const last = reasons.pop();
  return `This has ${reasons.join(', ')} and ${last}.`;
}
