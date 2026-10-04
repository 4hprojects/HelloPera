'use client';

import { useState } from 'react';
import { FormField } from '@/components/auth/form-field';
import { SelectField } from '@/components/ui/field';
import { BANK_KIND_LABELS, BANK_KINDS, OTHER_BANK, PH_BANKS } from '@/lib/finance/banks';

export type BankValues = { institution: string; kind: string; last4: string };

type Errors = Partial<Record<'institutionName' | 'bankKind' | 'bankLast4', string>>;

const isListed = (name: string) => (PH_BANKS as readonly string[]).includes(name);

/**
 * Bank picker, account kind and last 4 digits.
 *
 * Submits `institutionName`, `bankKind` and `bankLast4`. The picker itself has
 * no `name`; the resolved bank (a listed one, or the free text for "Other")
 * goes out through a hidden `institutionName`, which is the field the server
 * already reads.
 */
export function BankFields({
  idPrefix,
  initial,
  errors,
  onChange,
}: {
  idPrefix: string;
  initial?: Partial<BankValues>;
  errors?: Errors;
  /** Fires with every change so a parent can derive a suggested account name. */
  onChange?: (values: BankValues) => void;
}) {
  const start = initial?.institution ?? '';
  const [choice, setChoice] = useState(
    !start ? '' : isListed(start) ? start : OTHER_BANK,
  );
  const [other, setOther] = useState(start && !isListed(start) ? start : '');
  const [kind, setKind] = useState(initial?.kind ?? '');
  const [last4, setLast4] = useState(initial?.last4 ?? '');

  const resolve = (c: string, o: string) => (c === OTHER_BANK ? o.trim() : c);
  const emit = (next: Partial<{ c: string; o: string; k: string; l: string }>) => {
    const c = next.c ?? choice;
    const o = next.o ?? other;
    const k = next.k ?? kind;
    const l = next.l ?? last4;
    onChange?.({ institution: resolve(c, o), kind: k, last4: l });
  };

  return (
    <>
      <SelectField
        id={`${idPrefix}-bank`}
        name=""
        label="Bank"
        value={choice}
        onChange={(e) => {
          setChoice(e.target.value);
          emit({ c: e.target.value });
        }}
        wrapClassName="mb-4"
      >
        <option value="">Choose a bank</option>
        {PH_BANKS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
        <option value={OTHER_BANK}>Other bank</option>
      </SelectField>
      {choice === OTHER_BANK ? (
        <FormField
          id={`${idPrefix}-bank-other`}
          name=""
          label="Bank name"
          value={other}
          onChange={(e) => {
            setOther(e.target.value);
            emit({ o: e.target.value });
          }}
          maxLength={80}
          error={errors?.institutionName}
        />
      ) : null}
      <input type="hidden" name="institutionName" value={resolve(choice, other)} />

      <SelectField
        id={`${idPrefix}-kind`}
        name="bankKind"
        label="Account kind (optional)"
        value={kind}
        onChange={(e) => {
          setKind(e.target.value);
          emit({ k: e.target.value });
        }}
        wrapClassName="mb-4"
        error={errors?.bankKind}
      >
        <option value="">Not specified</option>
        {BANK_KINDS.map((k) => (
          <option key={k} value={k}>
            {BANK_KIND_LABELS[k]}
          </option>
        ))}
      </SelectField>

      <FormField
        id={`${idPrefix}-last4`}
        name="bankLast4"
        label="Last 4 digits (optional)"
        inputMode="numeric"
        maxLength={4}
        value={last4}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
          setLast4(digits);
          emit({ l: digits });
        }}
        hint="Helps tell similar accounts apart. Never enter your full account number."
        error={errors?.bankLast4}
      />
    </>
  );
}
