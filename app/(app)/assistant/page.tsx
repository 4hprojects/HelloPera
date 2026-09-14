import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { AssistantChat } from '@/components/ai/assistant-chat';
import { requireUser } from '@/lib/auth/guards';
import { isFlagEnabled } from '@/services/plan.service';
import { getUsageSummary } from '@/services/usage.service';
import { listConversations } from '@/services/ai-assistant.service';

export const metadata: Metadata = { title: 'Assistant' };

/**
 * /assistant — PHASE-12 §15, §81, §87, §92.
 *
 * §92: with `ai_enabled` off the page does not exist. A 404 rather than an
 * empty state, for the same reason `/settings/billing` 404s while billing is
 * off — a feature that cannot work invites support questions with no answer.
 */
export default async function AssistantPage() {
  const { user, profile } = await requireUser();

  if (!(await isFlagEnabled('ai_enabled'))) notFound();

  const [usage, conversations] = await Promise.all([
    getUsageSummary(user.id, profile.timezone).catch(() => null),
    listConversations(5).catch(() => []),
  ]);

  const ai = usage?.features.find((f) => f.feature === 'ai_queries') ?? null;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Assistant"
        description="Ask about your own records in plain English."
        actions={
          <Link href="/analytics" className={buttonClass('ghost', 'sm')}>
            Analytics
          </Link>
        }
      />

      {/*
        §42 — the remaining count is shown before someone runs out, not after.
        A limit discovered at the moment it blocks you reads as a trick.
      */}
      {ai && ai.limit !== null ? (
        <p className="hp-small mb-3 text-text-muted">
          {ai.remaining ?? 0} of {ai.limit} questions left this month.
        </p>
      ) : null}

      <AssistantChat conversationId={null} />

      {conversations.length > 0 ? (
        <Card className="mt-6">
          <p className="hp-label text-text-muted">Recent questions</p>
          <ul className="mt-2 space-y-1">
            {conversations.map((c) => (
              <li key={c.id} className="hp-small text-text-muted">
                {c.title}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
