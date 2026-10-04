'use client';

import { startTransition, useActionState, useState } from 'react';
import { createAccountAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { BankFields, type BankValues } from '@/components/finance/bank-fields';
import { suggestAccountName } from '@/lib/finance/banks';
import { ACCOUNT_TYPES, DEFAULT_NATURE, type AccountType } from '@/lib/finance/types';

const initial: ActionState = {};

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Every 3 months',
  yearly: 'Yearly',
} as const;

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

export function NewAccountForm({
  defaultCurrency,
  requestId,
}: {
  defaultCurrency: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(createAccountAction, initial);
  const [type, setType] = useState<AccountType>('cash');
  // The suggested name follows the bank fields until the person types their own.
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const suggest = (v: BankValues) => {
    if (!nameTouched) setName(suggestAccountName(v.institution, v.kind, v.last4));
  };

  // `other` has no sensible default, so the user must choose (§9).
  const nature = type === 'other' ? null : DEFAULT_NATURE[type];
  const isLiability = nature === 'liability';
  const isLoan = type === 'loan';
  const isBank = type === 'bank';

  return (
    <form
      noValidate
      // Dispatch the action by hand: with `<form action>` React resets the form
      // after every submit, which snaps the controlled selects (type, bank,
      // kind) back to their first option while their state still holds the
      // old value, so a failed save looked like a different account.
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
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

      {/* Bank first: choosing it fills the name below. */}
      {isBank ? (
        <BankFields idPrefix="new" onChange={suggest} errors={state.fieldErrors} />
      ) : null}
      <FormField
        id="name"
        label="Account name"
        required
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setNameTouched(true);
        }}
        hint="This is how the account appears when you pick it in transactions, bills and your dashboard."
        error={state.fieldErrors?.name}
      />
      {isBank ? null : (
        <FormField
          id="institutionName"
          label={isLoan ? 'Lender' : 'Bank or provider (optional)'}
          required={isLoan}
          error={state.fieldErrors?.institutionName}
        />
      )}

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
        {isLoan
          ? 'The remaining balance you owe today. Recorded as an opening entry you can see in your history.'
          : isLiability
            ? 'How much you owe on this account today. Recorded as an opening entry you can see in your history.'
            : 'How much is in this account today. Recorded as an opening entry you can see in your history.'}
      </p>

      {isLoan ? (
        <fieldset className="mb-5">
          <legend className="mb-3 font-medium text-text">Payment schedule</legend>
          <FormField
            id="paymentAmount"
            label="Amount due per payment"
            inputMode="decimal"
            required
            error={state.fieldErrors?.paymentAmount}
          />
          <FormField
            id="nextDueDate"
            label="Next due date"
            type="date"
            required
            error={state.fieldErrors?.nextDueDate}
          />
          <SelectField
            id="paymentFrequency"
            label="How often you pay"
            defaultValue="monthly"
            wrapClassName="mb-4"
          >
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          {state.fieldErrors?.paymentFrequency ? (
            <p className="hp-small mb-3 text-danger-text">
              {state.fieldErrors.paymentFrequency}
            </p>
          ) : null}
          <label className="mb-5 flex min-h-11 items-center gap-3 text-text">
            <input
              type="checkbox"
              name="createReminder"
              defaultChecked
              className="size-5"
            />
            Remind me of this payment (adds a recurring bill)
          </label>

          <legend className="mb-3 font-medium text-text">
            More about the loan (optional)
          </legend>
          <FormField
            id="principal"
            label="Original loan amount"
            inputMode="decimal"
            error={state.fieldErrors?.principal}
          />
          <FormField
            id="loanStartDate"
            label="Loan start date"
            type="date"
            error={state.fieldErrors?.loanStartDate}
          />
          <FormField
            id="interestRateApr"
            label="Interest rate (% per year)"
            inputMode="decimal"
            error={state.fieldErrors?.interestRateApr}
          />
          <FormField
            id="termMonths"
            label="Term (months)"
            inputMode="numeric"
            error={state.fieldErrors?.termMonths}
          />
          <p className="hp-small text-text-muted">
            Interest and term are for your reference. HelloPera does not calculate
            interest.
          </p>
        </fieldset>
      ) : null}

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Creating…' : 'Create account'}
      </Button>
    </form>
  );
}
