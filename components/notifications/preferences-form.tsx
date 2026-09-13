'use client';

import { useActionState } from 'react';
import { updateNotificationPreferencesAction } from '@/app/actions/notifications';
import type { ActionState } from '@/app/actions/auth';
import { FormAlert } from '@/components/auth/form-alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { NotificationPreferences } from '@/types/notifications';

const initial: ActionState = {};

/**
 * §50 — /settings/notifications.
 *
 * Every toggle is a plain checkbox in one form with one save button, rather
 * than eight controls that each save on change. A settings page that writes as
 * you touch it gives no way to change your mind, and offers no single moment
 * to confirm anything was saved.
 */
const TOGGLES: Array<{
  name: keyof NotificationPreferences;
  label: string;
  hint: string;
}> = [
  {
    name: 'billDueSoon',
    label: 'Bills due soon',
    hint: 'Three days before, and on the day.',
  },
  {
    name: 'billOverdue',
    label: 'Overdue bills',
    hint: 'At one day, one week and one month.',
  },
  {
    name: 'receivableDueSoon',
    label: 'Receivables due soon',
    hint: 'Three days before.',
  },
  {
    name: 'receivableOverdue',
    label: 'Overdue receivables',
    hint: 'When someone is late paying you.',
  },
  {
    name: 'expectedIncome',
    label: 'Expected income',
    hint: 'Before it is due, and if it does not arrive.',
  },
  {
    name: 'recurringEvents',
    label: 'Recurring items',
    hint: 'The day before a scheduled occurrence.',
  },
  {
    name: 'ocrReview',
    label: 'Documents to review',
    hint: 'When an upload has waited a day.',
  },
  {
    name: 'forecastShortfall',
    label: 'Projected shortfalls',
    hint: 'If your balance is projected below zero.',
  },
];

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <Label htmlFor={name}>{label}</Label>
        <p className="hp-small text-text-muted">{hint}</p>
      </div>
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--hp-primary)]"
      />
    </div>
  );
}

export function PreferencesForm({
  preferences,
  pushSupported,
}: {
  preferences: NotificationPreferences;
  /** Whether a push subscription exists. Push cannot be enabled without one. */
  pushSupported: boolean;
}) {
  const [state, action, pending] = useActionState(
    updateNotificationPreferencesAction,
    initial,
  );

  return (
    <form action={action} noValidate>
      {state.error ? <FormAlert tone="error">{state.error}</FormAlert> : null}
      {state.success ? <FormAlert tone="success">{state.success}</FormAlert> : null}

      <fieldset className="mb-6">
        <legend className="hp-label mb-1 text-text-muted">What to tell me about</legend>
        <div className="divide-y divide-border">
          {TOGGLES.map((t) => (
            <Toggle
              key={t.name}
              name={t.name}
              label={t.label}
              hint={t.hint}
              defaultChecked={preferences[t.name] as boolean}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="hp-label mb-1 text-text-muted">How</legend>
        <div className="divide-y divide-border">
          <Toggle
            name="inAppEnabled"
            label="In the app"
            hint="Shown in your notification centre."
            defaultChecked={preferences.inAppEnabled}
          />
          <div className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <Label htmlFor="pushEnabled">Push notifications</Label>
              <p className="hp-small text-text-muted">
                {pushSupported
                  ? 'Sent to devices you have allowed.'
                  : 'Allow notifications on a device first — the button is below.'}
              </p>
            </div>
            <input
              id="pushEnabled"
              name="pushEnabled"
              type="checkbox"
              defaultChecked={preferences.pushEnabled}
              disabled={!pushSupported}
              className="mt-1 h-5 w-5 shrink-0 accent-[var(--hp-primary)] disabled:opacity-40"
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="mb-6">
        <legend className="hp-label mb-1 text-text-muted">Quiet hours</legend>
        <Toggle
          name="quietHoursEnabled"
          label="Hold notifications overnight"
          hint="They are delivered when quiet hours end, never dropped."
          defaultChecked={preferences.quietHoursEnabled}
        />
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="quietHoursStart">From</Label>
            <input
              id="quietHoursStart"
              name="quietHoursStart"
              type="time"
              defaultValue={preferences.quietHoursStart}
              className="w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-text"
            />
          </div>
          <div>
            <Label htmlFor="quietHoursEnd">Until</Label>
            <input
              id="quietHoursEnd"
              name="quietHoursEnd"
              type="time"
              defaultValue={preferences.quietHoursEnd}
              className="w-full rounded-[var(--radius-hp)] border border-border-strong bg-surface px-3 py-2.5 text-[0.9375rem] text-text"
            />
          </div>
        </div>
        <p className="hp-small mt-2 text-text-muted">
          Times are in {preferences.timezone}.
        </p>
      </fieldset>

      <input type="hidden" name="timezone" value={preferences.timezone} />

      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : 'Save preferences'}
      </Button>
    </form>
  );
}
