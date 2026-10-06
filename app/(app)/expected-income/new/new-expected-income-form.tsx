'use client';

import { useActionState, useState } from 'react';
import { createExpectedIncomeAction } from '@/app/actions/obligations';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { FREQUENCIES, FREQUENCY_OPTION_LABEL } from '@/lib/recurring/schedule';

const initial: ActionState = {};

export function NewExpectedIncomeForm({
  defaultCurrency,
  categories,
}: {
  defaultCurrency: string;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createExpectedIncomeAction, initial);
  const [frequency, setFrequency] = useState('');
  const repeats = frequency !== '';
  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      <FormField
        id="sourceName"
        label="Source"
        required
        error={state.fieldErrors?.sourceName}
      />
      <FormField
        id="amount"
        label="Estimated amount"
        inputMode="decimal"
        required
        hint="Pay changes? Enter your usual amount. You can correct it when the money arrives."
        error={state.fieldErrors?.amount}
      />
      <FormField
        id="expectedDate"
        label={repeats ? 'First estimated date' : 'Estimated date'}
        type="date"
        required
        error={state.fieldErrors?.expectedDate}
      />
      <SelectField
        id="frequency"
        label="Repeats"
        value={frequency}
        onChange={(e) => setFrequency(e.target.value)}
        wrapClassName="mb-4"
      >
        <option value="">Does not repeat</option>
        {FREQUENCIES.map((f) => (
          <option key={f} value={f}>
            {FREQUENCY_OPTION_LABEL[f]}
          </option>
        ))}
      </SelectField>
      {repeats ? (
        <FormField
          id="endDate"
          label="Ends (optional)"
          type="date"
          error={state.fieldErrors?.endDate}
        />
      ) : null}
      <SelectField id="categoryId" label="Category" defaultValue="" wrapClassName="mb-4">
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <input type="hidden" name="currencyCode" value={defaultCurrency} />
      <p className="hp-small mb-4 text-text-muted">
        Expected income is a plan, not a balance. It affects nothing until it arrives.
        {repeats
          ? ' Each pay date is created with this estimate and can be edited on its own.'
          : ''}
      </p>
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : repeats ? 'Add recurring income' : 'Add expected income'}
      </Button>
    </form>
  );
}
