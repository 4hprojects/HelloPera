'use client';

import { useActionState, useState } from 'react';
import { createTransactionAction } from '@/app/actions/finance';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
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

export function NewTransactionForm({
  accounts,
  categories,
  defaultDate,
  initialType,
  requestId,
}: {
  accounts: AccountOption[];
  categories: CategoryOption[];
  defaultDate: string;
  initialType: string;
  requestId: string;
}) {
  const [state, action, pending] = useActionState(createTransactionAction, initial);
  const [type, setType] = useState<TransactionType>(
    (PICKABLE.find((p) => p.value === initialType)?.value ??
      'expense') as TransactionType,
  );

  const needs = ACCOUNT_REQUIREMENTS[type];
  const [sourceId, setSourceId] = useState(accounts[0]?.id ?? '');
  const [destinationId, setDestinationId] = useState('');

  const source = accounts.find((a) => a.id === sourceId);
  // A transfer can only land in another account of the same currency.
  const destinationOptions =
    type === 'transfer'
      ? accounts.filter((a) => a.id !== sourceId && a.currency === source?.currency)
      : accounts;
  const destination =
    destinationOptions.find((a) => a.id === destinationId) ?? destinationOptions[0];
  const currency = needs.source ? source?.currency : destination?.currency;

  function changeSource(id: string) {
    setSourceId(id);
    // Drop a destination that no longer fits the new source's currency.
    const next = accounts.find((a) => a.id === id);
    const current = accounts.find((a) => a.id === destinationId);
    if (type === 'transfer' && current && current.currency !== next?.currency) {
      setDestinationId('');
    }
  }

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
      <input type="hidden" name="requestId" value={requestId} />
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
        <SelectField
          id="sourceAccountId"
          label={sourceLabel}
          required
          value={sourceId}
          onChange={(e) => changeSource(e.target.value)}
          error={state.fieldErrors?.sourceAccountId}
          wrapClassName="mb-4"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      ) : null}

      {needs.destination ? (
        <SelectField
          id="destinationAccountId"
          label={type === 'transfer' ? 'To account' : 'Received into'}
          required
          value={destination?.id ?? ''}
          onChange={(e) => setDestinationId(e.target.value)}
          error={state.fieldErrors?.destinationAccountId}
          wrapClassName="mb-4"
        >
          {destinationOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      ) : null}

      {type === 'transfer' && destinationOptions.length === 0 ? (
        <FormAlert tone="error">
          You need a second {source?.currency} account to transfer between. Transfers
          cannot cross currencies.
        </FormAlert>
      ) : null}

      {needs.direction ? (
        <SelectField
          id="direction"
          label="Direction"
          defaultValue="increase"
          wrapClassName="mb-4"
        >
          <option value="increase">Increase the balance</option>
          <option value="decrease">Decrease the balance</option>
        </SelectField>
      ) : null}

      {type === 'transfer' ? (
        <p className="hp-small mb-4 text-text-muted">
          Transfers move money between your own accounts. They never count as income or
          expense — paying a credit card is a transfer, not a second expense.
        </p>
      ) : null}

      {type !== 'transfer' && type !== 'adjustment' ? (
        <SelectField
          id="categoryId"
          label="Category"
          defaultValue=""
          wrapClassName="mb-4"
        >
          <option value="">No category</option>
          {relevantCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <FormField
        id="transactionDate"
        label="Date"
        type="date"
        defaultValue={defaultDate}
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

      {currency ? (
        <p className="hp-small mb-4 text-text-muted">
          Recorded in {currency}, the currency of the selected account.
        </p>
      ) : null}
      <input type="hidden" name="currencyCode" value={currency ?? ''} />

      <Button type="submit" disabled={pending} size="lg" className="mt-2 w-full">
        {pending ? 'Saving…' : 'Save transaction'}
      </Button>
    </form>
  );
}
