'use client';

import { useActionState } from 'react';
import { updateProfile, type ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';

const initial: ActionState = {};

/** Kept short — Philippines-first, with room to grow. */
const TIMEZONES = ['Asia/Manila', 'Asia/Singapore', 'Asia/Tokyo', 'UTC'];
const CURRENCIES = ['PHP', 'USD', 'EUR', 'JPY', 'SGD'];

export function SettingsForm({
  firstName,
  lastName,
  timezone,
  defaultCurrency,
}: {
  firstName: string;
  lastName: string;
  timezone: string;
  defaultCurrency: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, initial);

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}

      <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
        <FormField
          id="firstName"
          label="First name"
          defaultValue={firstName}
          autoComplete="given-name"
          error={state.fieldErrors?.firstName}
        />
        <FormField
          id="lastName"
          label="Last name"
          defaultValue={lastName}
          autoComplete="family-name"
          error={state.fieldErrors?.lastName}
        />
      </div>

      <SelectField
        id="timezone"
        label="Timezone"
        defaultValue={timezone}
        hint="Used for transaction dates, bill due dates and monthly totals."
        wrapClassName="mb-4"
      >
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </SelectField>

      <SelectField
        id="defaultCurrency"
        label="Default currency"
        defaultValue={defaultCurrency}
        hint="HelloPera never converts between currencies — totals are always shown per currency."
        wrapClassName="mb-5"
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </SelectField>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save changes'}
      </Button>
    </form>
  );
}
