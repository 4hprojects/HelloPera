'use client';

import { useActionState } from 'react';
import { markAllNotificationsReadAction } from '@/app/actions/notifications';
import type { ActionState } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';

const initial: ActionState = {};

export function MarkAllRead({ disabled }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(
    markAllNotificationsReadAction,
    initial,
  );

  return (
    <form action={action}>
      <Button type="submit" variant="ghost" size="sm" disabled={pending || disabled}>
        {pending ? 'Marking…' : 'Mark all read'}
      </Button>
      {state.success ? (
        <span role="status" className="sr-only">
          {state.success}
        </span>
      ) : null}
    </form>
  );
}
