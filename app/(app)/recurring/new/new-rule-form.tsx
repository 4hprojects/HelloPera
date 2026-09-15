'use client';

import { useActionState, useState } from 'react';
import { createRecurringRuleAction } from '@/app/actions/recurring';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { FormField } from '@/components/auth/form-field';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { FREQUENCIES } from '@/lib/recurring/schedule';
import { RULE_TYPES, type RuleType } from '@/schemas/recurring.schema';

const initial: ActionState = {};

/**
 * §49 — "Dynamic fields depend on type."
 *
 * The type is chosen first because it changes what the rest of the form even
 * means: a bill has a provider, expected income has a source, and a plain
 * income/expense rule has neither. Showing all of them at once would ask the
 * user to work out which three of seven fields apply to them.
 */
const TYPE_LABEL: Record<RuleType, string> = {
  income: 'Income',
  expense: 'Expense',
  bill: 'Bill',
  expected_income: 'Expected income',
};

const TYPE_HINT: Record<RuleType, string> = {
  income:
    'Money you expect to earn regularly. Creates an expected event, not a transaction.',
  expense: 'A regular outgoing. Creates an expected event you confirm when it happens.',
  bill: 'Creates a real bill each time, which then follows the normal bill lifecycle.',
  expected_income:
    'Creates an expected-income record each time, ready to link when it arrives.',
};

const WEEKDAYS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

export function NewRuleForm({
  defaultCurrency,
  accounts,
  categories,
}: {
  defaultCurrency: string;
  accounts: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createRecurringRuleAction, initial);
  const [ruleType, setRuleType] = useState<RuleType>('bill');
  const [frequency, setFrequency] = useState<string>('monthly');

  const isWeekly = frequency === 'weekly' || frequency === 'biweekly';

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}

      <SelectField
        id="ruleType"
        label="What repeats?"
        value={ruleType}
        onChange={(e) => setRuleType(e.target.value as RuleType)}
        hint={TYPE_HINT[ruleType]}
        wrapClassName="mb-4"
      >
        {RULE_TYPES.map((t) => (
          <option key={t} value={t}>
            {TYPE_LABEL[t]}
          </option>
        ))}
      </SelectField>

      <FormField
        id="name"
        label="Name"
        required
        placeholder="Internet"
        error={state.fieldErrors?.name}
      />

      {ruleType === 'bill' ? (
        <FormField
          id="providerName"
          label="Provider (optional)"
          placeholder="Converge"
          error={state.fieldErrors?.providerName}
        />
      ) : null}

      {ruleType === 'expected_income' ? (
        <FormField
          id="sourceName"
          label="Source (optional)"
          placeholder="DOST stipend"
          error={state.fieldErrors?.sourceName}
        />
      ) : null}

      <FormField
        id="amount"
        label="Amount"
        inputMode="decimal"
        required
        error={state.fieldErrors?.amount}
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <SelectField
          id="frequency"
          label="Repeats"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
        >
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {f[0]!.toUpperCase() + f.slice(1)}
            </option>
          ))}
        </SelectField>
        <FormField
          id="intervalCount"
          label="Every"
          type="number"
          min={1}
          max={52}
          defaultValue={1}
          error={state.fieldErrors?.intervalCount}
        />
      </div>

      {/*
        §58 — day_of_month is optional and derived from the start date when
        left blank. Asking twice for something the start date already says is
        a question with one correct answer.
      */}
      {isWeekly ? (
        <SelectField
          id="dayOfWeek"
          label="On (optional)"
          defaultValue=""
          wrapClassName="mb-4"
        >
          <option value="">Same weekday as the start date</option>
          {WEEKDAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </SelectField>
      ) : (
        <SelectField
          id="dayOfMonth"
          label="Day of month (optional)"
          defaultValue=""
          hint="A day past the end of a short month uses that month’s last day, then returns to the chosen day."
          wrapClassName="mb-4"
        >
          <option value="">Same day as the start date</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </SelectField>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <FormField
          id="startDate"
          label="Starts"
          type="date"
          required
          error={state.fieldErrors?.startDate}
        />
        <FormField
          id="endDate"
          label="Ends (optional)"
          type="date"
          error={state.fieldErrors?.endDate}
        />
      </div>

      {ruleType !== 'bill' && ruleType !== 'expected_income' ? (
        <SelectField
          id="accountId"
          label="Account (optional)"
          defaultValue=""
          wrapClassName="mb-4"
        >
          <option value="">No account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <SelectField
        id="categoryId"
        label="Category (optional)"
        defaultValue=""
        wrapClassName="mb-4"
      >
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>

      <FormField
        id="description"
        label="Description (optional)"
        error={state.fieldErrors?.description}
      />

      <input type="hidden" name="currencyCode" value={defaultCurrency} />

      <p className="hp-small mb-4 text-text-muted">
        A recurring rule creates expected events, never transactions. Nothing moves your
        balance until you record it.
      </p>

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : 'Create rule'}
      </Button>
    </form>
  );
}
