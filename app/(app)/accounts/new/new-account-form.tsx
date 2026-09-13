'use client';

import { useActionState, useState } from 'react';
import { createAccountAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
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

const selectClass =
  'w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-text';

export function NewAccountForm({ defaultCurrency }: { defaultCurrency: string }) {
  const [state, action, pending] = useActionState(createAccountAction, initial);
  const [type, setType] = useState<AccountType>('cash');

  // `other` has no sensible default, so the user must choose (§9).
  const nature = type === 'other' ? null : DEFAULT_NATURE[type];
  const isLiability = nature === 'liability';

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <div className="mb-4">
        <Label htmlFor="type">Account type</Label>
        <select
          id="type"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className={selectClass}
        >
          {ACCOUNT_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {nature ? (
        <input type="hidden" name="nature" value={nature} />
      ) : (
        <div className="mb-4">
          <Label htmlFor="nature">Is this money you own or money you owe?</Label>
          <select id="nature" name="nature" className={selectClass} defaultValue="asset">
            <option value="asset">Money I own (asset)</option>
            <option value="liability">Money I owe (liability)</option>
          </select>
        </div>
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

      <div className="mb-4">
        <Label htmlFor="currencyCode">Currency</Label>
        <select
          id="currencyCode"
          name="currencyCode"
          defaultValue={defaultCurrency}
          className={selectClass}
        >
          {['PHP', 'USD', 'EUR', 'JPY', 'SGD'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

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
