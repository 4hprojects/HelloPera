import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_THRESHOLD,
  explainCandidate,
  findCandidates,
  normaliseMerchant,
  scoreCandidate,
  type ExistingRecord,
} from '@/lib/ocr/duplicate';
import {
  extractedFieldsSchema,
  extractionResultSchema,
  lowConfidenceFields,
  missingRequiredFields,
} from '@/lib/ocr/schema';

const existing = (over: Partial<ExistingRecord> = {}): ExistingRecord => ({
  id: 'tx-1',
  amount: '1250.00',
  currency: 'PHP',
  date: '2026-09-12',
  merchant: 'Jollibee',
  reference: null,
  documentHash: null,
  ...over,
});

describe('duplicate scoring', () => {
  it('flags the same amount, date and merchant', () => {
    const c = scoreCandidate(
      {
        amount: '1250.00',
        currency: 'PHP',
        date: '2026-09-12',
        merchant: 'Jollibee',
        reference: null,
        documentHash: null,
      },
      existing(),
    );
    expect(c?.signals).toEqual(['same_amount', 'same_date', 'same_merchant']);
    expect(c?.score).toBe(70);
  });

  it('treats an identical file as near-certain', () => {
    const c = scoreCandidate(
      {
        amount: null,
        currency: null,
        date: null,
        merchant: null,
        reference: null,
        documentHash: 'abc123',
      },
      existing({ documentHash: 'abc123' }),
    );
    expect(c?.signals).toContain('same_document_hash');
    expect(c?.score).toBe(100);
  });

  it('weighs a matching reference number heavily', () => {
    const c = scoreCandidate(
      {
        amount: null,
        currency: null,
        date: null,
        merchant: null,
        reference: 'REF-9981',
        documentHash: null,
      },
      existing({ reference: 'REF-9981' }),
    );
    expect(c?.score).toBe(70);
    expect(c!.score).toBeGreaterThanOrEqual(CANDIDATE_THRESHOLD);
  });

  it('compares amounts as money, not strings', () => {
    // "1250" and "1250.00" are the same payment.
    const c = scoreCandidate(
      {
        amount: '1250',
        currency: 'PHP',
        date: null,
        merchant: null,
        reference: null,
        documentHash: null,
      },
      existing(),
    );
    expect(c?.signals).toContain('same_amount');
  });

  it('never matches across currencies', () => {
    // HelloPera does not convert, so these cannot be the same payment.
    const c = scoreCandidate(
      {
        amount: '1250.00',
        currency: 'USD',
        date: '2026-09-12',
        merchant: 'Jollibee',
        reference: null,
        documentHash: null,
      },
      existing({ currency: 'PHP' }),
    );
    expect(c).toBeNull();
  });

  it('allows a couple of days drift between receipt and posting', () => {
    const c = scoreCandidate(
      {
        amount: '1250.00',
        currency: 'PHP',
        date: '2026-09-14',
        merchant: null,
        reference: null,
        documentHash: null,
      },
      existing({ date: '2026-09-12' }),
    );
    expect(c?.signals).toContain('near_date');
  });

  it('does not treat a week apart as related', () => {
    const c = scoreCandidate(
      {
        amount: null,
        currency: null,
        date: '2026-09-19',
        merchant: null,
        reference: null,
        documentHash: null,
      },
      existing({ date: '2026-09-12' }),
    );
    expect(c).toBeNull();
  });

  it('returns nothing when nothing matches', () => {
    const c = scoreCandidate(
      {
        amount: '99.00',
        currency: 'PHP',
        date: '2026-01-01',
        merchant: 'Other',
        reference: null,
        documentHash: null,
      },
      existing(),
    );
    expect(c).toBeNull();
  });
});

describe('merchant normalisation', () => {
  it('ignores case, punctuation and store numbers', () => {
    expect(normaliseMerchant('SM SUPERMALLS #123')).toBe('sm supermalls 123');
    expect(normaliseMerchant('Jollibee')).toBe(normaliseMerchant('JOLLIBEE'));
  });

  it('matches a substring, since receipts abbreviate', () => {
    const c = scoreCandidate(
      {
        amount: null,
        currency: null,
        date: null,
        merchant: 'Jollibee Katipunan',
        reference: null,
        documentHash: null,
      },
      existing({ merchant: 'Jollibee' }),
    );
    expect(c?.signals).toContain('same_merchant');
  });

  it('handles missing names', () => {
    expect(normaliseMerchant(null)).toBeNull();
    expect(normaliseMerchant('   ')).toBeNull();
  });
});

describe('findCandidates', () => {
  it('ranks the strongest match first', () => {
    const found = findCandidates(
      {
        amount: '1250.00',
        currency: 'PHP',
        date: '2026-09-12',
        merchant: 'Jollibee',
        reference: 'R1',
        documentHash: null,
      },
      [
        existing({ id: 'weak', merchant: null, date: '2026-09-13', reference: null }),
        existing({ id: 'strong', reference: 'R1' }),
      ],
    );
    expect(found[0]!.id).toBe('strong');
    expect(found[0]!.score).toBeGreaterThan(found[1]!.score);
  });

  it('suppresses weak matches below the threshold', () => {
    // Same date alone is 20 — far too common to raise with the user.
    const found = findCandidates(
      {
        amount: null,
        currency: null,
        date: '2026-09-12',
        merchant: null,
        reference: null,
        documentHash: null,
      },
      [existing()],
    );
    expect(found).toEqual([]);
  });
});

describe('explainCandidate', () => {
  it('says why, so the user can judge rather than trust a score', () => {
    const c = scoreCandidate(
      {
        amount: '1250.00',
        currency: 'PHP',
        date: '2026-09-12',
        merchant: 'Jollibee',
        reference: null,
        documentHash: null,
      },
      existing(),
    )!;
    expect(explainCandidate(c)).toBe(
      'This has the same amount, the same date and the same merchant.',
    );
  });
});

describe('extraction schema', () => {
  it('accepts a well-formed receipt extraction', () => {
    const r = extractionResultSchema.safeParse({
      fields: {
        documentType: 'receipt',
        suggestedTarget: 'transaction',
        merchantName: 'Jollibee',
        amount: '850.00',
        currencyCode: 'php',
        transactionDate: '2026-09-12',
      },
      confidence: { amount: 0.99, transactionDate: 0.91, merchantName: 0.84 },
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.fields.currencyCode).toBe('PHP');
  });

  it('rejects an amount that is not a plain decimal', () => {
    // A model returning "₱1,234.56" must fail rather than be silently coerced.
    for (const bad of ['₱1,234.56', '1,234.56', '1234.567', '-50.00', 'abc']) {
      const r = extractedFieldsSchema.safeParse({ amount: bad });
      expect(r.success, `expected ${bad} to be rejected`).toBe(false);
    }
  });

  it('accepts a missing amount rather than inventing one', () => {
    expect(extractedFieldsSchema.safeParse({ amount: null }).success).toBe(true);
  });

  it('rejects an impossible date that is still well-formed', () => {
    expect(
      extractedFieldsSchema.safeParse({ transactionDate: '2026-13-45' }).success,
    ).toBe(false);
  });

  it('defaults to unknown rather than guessing a target', () => {
    const r = extractedFieldsSchema.parse({});
    expect(r.documentType).toBe('unknown');
    expect(r.suggestedTarget).toBe('unknown');
  });

  it('rejects confidence outside 0-1', () => {
    const r = extractionResultSchema.safeParse({
      fields: {},
      confidence: { amount: 1.5 },
    });
    expect(r.success).toBe(false);
  });
});

describe('required fields before a record can be created', () => {
  it('names what is missing for a bill', () => {
    expect(missingRequiredFields('bill', { amount: '100.00' })).toEqual([
      'providerName',
      'dueDate',
    ]);
  });

  it('is satisfied when everything is present', () => {
    expect(
      missingRequiredFields('transaction', {
        amount: '100.00',
        transactionDate: '2026-09-12',
      }),
    ).toEqual([]);
  });

  it('treats an empty string as missing', () => {
    expect(
      missingRequiredFields('receivable', { partyName: '', amount: '10.00' }),
    ).toEqual(['partyName']);
  });

  it('requires nothing when the target is unknown', () => {
    expect(missingRequiredFields('unknown', {})).toEqual([]);
  });
});

describe('lowConfidenceFields', () => {
  it('flags fields below the threshold for review', () => {
    expect(lowConfidenceFields({ amount: 0.99, paymentMethod: 0.67 })).toEqual([
      'paymentMethod',
    ]);
  });

  it('treats the threshold itself as acceptable', () => {
    expect(lowConfidenceFields({ amount: 0.8 })).toEqual([]);
  });
});
