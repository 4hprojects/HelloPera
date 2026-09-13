'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { markNotificationReadAction } from '@/app/actions/notifications';
import type { ActionState } from '@/app/actions/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import type { Notification } from '@/types/notifications';

const initial: ActionState = {};

/**
 * The notification centre list — PHASE-08 §19, §66, §68, §69.
 *
 * Unread is marked with a dot AND the word "New" (§69, and the design
 * system's rule that status is never conveyed by colour alone) — a coloured
 * dot on its own is invisible to a screen reader and to anyone who cannot
 * distinguish it from the read state.
 */
export function NotificationList({ items }: { items: Notification[] }) {
  const [state, action, pending] = useActionState(markNotificationReadAction, initial);

  if (!items.length) {
    return (
      <EmptyState
        title="Nothing to catch up on"
        description="Reminders about bills, receivables and expected income will appear here."
      />
    );
  }

  return (
    <div>
      <ul className="divide-y divide-border">
        {items.map((n) => {
          const unread = n.readAt === null;

          const body = (
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="hp-body truncate font-medium text-text">{n.title}</p>
                {unread ? <Badge tone="info">New</Badge> : null}
              </div>
              <p className="hp-body mt-0.5 text-sm text-text-muted">{n.message}</p>
              <p className="mt-1 text-xs text-text-muted">
                {new Date(n.createdAt).toLocaleString()}
              </p>
            </div>
          );

          return (
            <li key={n.id} className="flex items-start gap-3 py-3">
              {n.href ? (
                <Link
                  href={n.href}
                  className="flex min-w-0 flex-1 rounded-[var(--radius-hp)] transition-colors hover:bg-surface-raised"
                >
                  {body}
                </Link>
              ) : (
                body
              )}

              {unread ? (
                <form action={action} className="shrink-0">
                  <input type="hidden" name="id" value={n.id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={pending}>
                    Mark read
                  </Button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      {state.error ? (
        <p role="alert" className="hp-small mt-2 text-danger-text">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
