'use client';

import { useActionState } from 'react';
import { transitionRuleAction } from '@/app/actions/recurring';
import type { ActionState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import type { RuleStatus } from '@/types/recurring';

const initial: ActionState = {};

/**
 * §21, §22, §24 — pause, resume, end.
 *
 * Three distinct things, kept distinct (§42): pausing stops future generation
 * and keeps what already exists; ending stops it permanently and preserves the
 * history; neither deletes anything, because §14 says not to physically delete
 * a rule with history.
 */
export function RuleActions({ id, status }: { id: string; status: RuleStatus }) {
  const [state, action, pending] = useActionState(transitionRuleAction, initial);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === 'active' ? (
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="pause" />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              Pause
            </Button>
          </form>
        ) : null}

        {status === 'paused' ? (
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="resume" />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              Resume
            </Button>
          </form>
        ) : null}

        {status !== 'ended' ? (
          <form action={action}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="end" />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              End rule
            </Button>
          </form>
        ) : null}
      </div>

      {state.success ? (
        <p role="status" className="hp-small mt-2 text-text-muted">
          {state.success}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="hp-small mt-2 text-danger-text">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
