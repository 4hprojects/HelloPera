'use client';

import { useActionState, useState } from 'react';
import { createTransactionAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ACCOUNT_REQUIREMENTS } from '@/lib/finance/balance';
import type { AccountNature, TransactionType } from '@/lib/finance/types';

const initial: ActionState = {};

type AccountOption = {
  id: string;
  name: string;
  nature: AccountNature;
  currency: string;
};
type CategoryOption = { id: string; name: string; type: 'income' | 'expense' | 'both' };

/** Only the types a person records by hand. opening_balance is created with
 *  the account; refund needs an original transaction to point at. */
const PICKABLE: Array<{ value: TransactionType; label: string; hint: string }> = [
  { value: 'expense', label: 'Expense', hint: 'Money going out' },
  { value: 'income', label: 'Income', hint: 'Money coming in' },
  { value: 'transfer', label: 'Transfer', hint: 'Between your own accounts' },
  { value: 'adjustment', label: 'Adjustment', hint: 'Correct a balance' },
];

const selectClass =
  'w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-text';

export function NewTransactionForm({
  accounts,
  categories,
  defaultCurrency,
  initialType,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultCurrency: string;
  initialType: string;
}) {
  const [state, action, pending] = useActionState(createTransactionAction, initial);
  const [type, setType] = useState<TransactionType>(
    (PICKABLE.find((p) => p.value === initialType)?.value ??
      'expense') as TransactionType,
  );

  const needs = ACCOUNT_REQUIREMENTS[type];
  const today = new Date().toISOString().slice(0, 10);

  const relevantCategories = categories.filter((c) =>
    type === 'income'
      ? c.type !== 'expense'
      : type === 'expense'
        ? c.type !== 'income'
        : true,
  );

  const sourceLabel =
    type === 'transfer'
      ? 'From account'
      : type === 'adjustment'
        ? 'Account'
        : 'Paid from';

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <fieldset className="mb-4">
        <legend className="mb-1.5 block text-sm font-medium text-text">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {PICKABLE.map((option) => (
            <label
              key={option.value}
              className={
                'cursor-pointer rounded-[var(--radius-hp)] border px-3 py-2.5 ' +
                (type === option.value
                  ? 'border-primary bg-surface-muted'
                  : 'border-border-strong')
              }
            >
              <input
                type="radio"
                name="type"
                value={option.value}
                checked={type === option.value}
                onChange={() => setType(option.value)}
                className="sr-only"
              />
              <span className="block text-sm font-medium text-text">{option.label}</span>
              <span className="hp-small block text-text-muted">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FormField
        id="amount"
        label="Amount"
        inputMode="decimal"
        placeholder="0.00"
        required
        error={state.fieldErrors?.amount}
      />

      {needs.source ? (
        <div className="mb-4">
          <Label htmlFor="sourceAccountId">{sourceLabel}</Label>
          <select
            id="sourceAccountId"
            name="sourceAccountId"
            className={selectClass}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
          {state.fieldErrors?.sourceAccountId ? (
            <p role="alert" className="hp-small mt-1 text-danger-text">
              {state.fieldErrors.sourceAccountId}
            </p>
          ) : null}
        </div>
      ) : null}

      {needs.destination ? (
        <div className="mb-4">
          <Label htmlFor="destinationAccountId">
            {type === 'transfer' ? 'To account' : 'Received into'}
          </Label>
          <select
            id="destinationAccountId"
            name="destinationAccountId"
            className={selectClass}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
          {state.fieldErrors?.destinationAccountId ? (
            <p role="alert" className="hp-small mt-1 text-danger-text">
              {state.fieldErrors.destinationAccountId}
            </p>
          ) : null}
        </div>
      ) : null}

      {needs.direction ? (
        <div className="mb-4">
          <Label htmlFor="direction">Direction</Label>
          <select
            id="direction"
            name="direction"
            className={selectClass}
            defaultValue="increase"
          >
            <option value="increase">Increase the balance</option>
            <option value="decrease">Decrease the balance</option>
          </select>
        </div>
      ) : null}

      {type === 'transfer' ? (
        <p className="hp-small mb-4 text-text-muted">
          Transfers move money between your own accounts. They never count as income or
          expense — paying a credit card is a transfer, not a second expense.
        </p>
      ) : null}

      {type !== 'transfer' && type !== 'adjustment' ? (
        <div className="mb-4">
          <Label htmlFor="categoryId">Category</Label>
          <select
            id="categoryId"
            name="categoryId"
            className={selectClass}
            defaultValue=""
          >
            <option value="">No category</option>
            {relevantCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <FormField
        id="transactionDate"
        label="Date"
        type="date"
        defaultValue={today}
        required
        error={state.fieldErrors?.transactionDate}
      />

      {type === 'expense' ? (
        <FormField
          id="merchantName"
          label="Merchant (optional)"
          error={state.fieldErrors?.merchantName}
        />
      ) : (
        <FormField
          id="description"
          label="Description (optional)"
          error={state.fieldErrors?.description}
        />
      )}

      <input type="hidden" name="currencyCode" value={defaultCurrency} />

      <Button type="submit" disabled={pending} size="lg" className="mt-2 w-full">
        {pending ? 'Saving…' : 'Save transaction'}
      </Button>
    </form>
  );
}
