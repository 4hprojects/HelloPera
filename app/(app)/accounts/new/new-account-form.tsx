'use client';

import { useActionState, useState } from 'react';
import { createAccountAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { ACCOUNT_TYPES, DEFAULT_NATURE, type AccountType } from '@/lib/finance/types';

const initial: ActionState = {};

const TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank',
  gcash: 'GCash',
  maya: 'Maya',
  paypal: 'PayPal',
  credit_card: 'Credit card',
  loan: 'Loan',
  investment: 'Investment',
  other: 'Other',
};

export function NewAccountForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState(createAccountAction, initial);
  const [type, setType] = useState<AccountType>('cash');

  // `other` has no sensible default, so the user must choose (§9).
  const nature = type === 'other' ? null : DEFAULT_NATURE[type];
  const isLiability = nature === 'liability';

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <SelectField
        id="type"
        label="Account type"
        value={type}
        onChange={(e) => setType(e.target.value as AccountType)}
        wrapClassName="mb-4"
      >
        {ACCOUNT_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABELS[t]}
          </option>
        ))}
      </SelectField>

      {nature ? (
        <input type="hidden" name="nature" value={nature} />
      ) : (
        <SelectField
          id="nature"
          label="Money you own, or money you owe?"
          defaultValue="asset"
          wrapClassName="mb-4"
        >
          <option value="asset">Money I own (asset)</option>
          <option value="liability">Money I owe (liability)</option>
        </SelectField>
      )}

      <FormField
        id="name"
        label="Account name"
        required
        error={state.fieldErrors?.name}
      />
      <FormField
        id="institutionName"
        label="Bank or provider (optional)"
        error={state.fieldErrors?.institutionName}
      />

      <SelectField
        id="currencyCode"
        label="Currency"
        defaultValue={defaultCurrency}
        wrapClassName="mb-4"
      >
        {['PHP', 'USD', 'EUR', 'JPY', 'SGD'].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>

      <FormField
        id="openingBalance"
        label={isLiability ? 'Amount currently owed' : 'Current balance'}
        inputMode="decimal"
        defaultValue="0"
        error={state.fieldErrors?.openingBalance}
      />
      <p className="hp-small mb-5 text-text-muted">
        {isLiability
          ? 'How much you owe on this account today. Recorded as an opening entry you can see in your history.'
          : 'How much is in this account today. Recorded as an opening entry you can see in your history.'}
      </p>

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  );
}
