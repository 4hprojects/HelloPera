import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/log';
import type { AnyAuditEvent, AuditEntityType } from '@/types/auth';

/**
 * Append an audit row.
 *
 * Never throws. An audit write failing must not break the operation the user
 * asked for — but it must be visible, so failures go to the error log.
 *
 * Never record passwords, tokens, or OAuth secrets (§42).
 */
export async function recordAuditEvent(params: {
  eventType: AnyAuditEvent;
  actorUserId?: string | null;
  targetUserId?: string | null;
  /**
   * Which domain this row belongs to. Defaults to `auth`, which is all this
   * helper recorded until Phase 07 — every financial event carries its own
   * type so the two can be told apart when read back (PHASE-07 §61).
   */
  entityType?: AuditEntityType;
  /** The row the event is about, where there is one. */
  entityId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('audit_logs').insert({
      actor_user_id: params.actorUserId ?? null,
      target_user_id: params.targetUserId ?? params.actorUserId ?? null,
      entity_type: params.entityType ?? 'auth',
      entity_id: params.entityId ?? null,
      event_type: params.eventType,
      metadata: params.metadata ?? {},
    });
    if (error) {
      log.error('audit write failed', { event: params.eventType, code: error.code });
    }
  } catch (error) {
    log.error('audit write threw', {
      event: params.eventType,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
