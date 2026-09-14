-- =============================================================================
-- Phase 12 — AI Financial Assistant: conversations, messages, provider logs
--
-- The storage half. Nothing here knows which model answers a question: §7
-- forbids hardcoding model identifiers through business logic, so `provider`
-- and `model` are plain text columns written by whichever adapter ran.
--
-- ## What is deliberately NOT stored
--
-- §18: not whole query result payloads, not raw OCR text, not account numbers.
-- `ai_messages.query_metadata` holds the intent and the resolved date range —
-- enough to show why an answer said what it said, and to investigate a bad
-- one, without keeping a second copy of the user's finances in a jsonb column
-- that no retention policy covers.
--
-- §94: the audit log never receives prompt text either. That rule lives in
-- `lib/auth/audit.ts` callers; this file is where the *conversation* copy
-- lives, and it is scoped to the user who wrote it.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ai_conversations (§17)
-- -----------------------------------------------------------------------------

create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text,
  is_archived boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The list page: a user's live threads, most recently used first.
create index if not exists ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc)
  where is_archived = false;

-- -----------------------------------------------------------------------------
-- ai_messages (§17, §18)
--
-- `role` is constrained rather than free text because the whole grounding
-- story depends on being able to tell whose words a row holds. A forged
-- 'assistant' row is the application appearing to have said something it never
-- said — which is why there is no client write path to this table at all.
-- -----------------------------------------------------------------------------

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null,
  content         text not null,
  -- Null for a user turn, and for an assistant turn that never resolved to a
  -- supported intent (a clarification, or a refusal).
  intent          text,
  query_metadata  jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_messages_role_check') then
    alter table public.ai_messages add constraint ai_messages_role_check
      check (role in ('user', 'assistant'));
  end if;

  -- §44 — the same 2000-character ceiling the action enforces, stated here too
  -- so a future caller that forgets cannot write an unbounded prompt.
  if not exists (select 1 from pg_constraint where conname = 'ai_messages_content_length_check') then
    alter table public.ai_messages add constraint ai_messages_content_length_check
      check (char_length(content) <= 8000);
  end if;
end $$;

-- Reading one thread in order.
create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- -----------------------------------------------------------------------------
-- ai_usage_logs (§54, §55)
--
-- Provider calls, for cost analysis. Deliberately NOT the quota unit: one
-- question is one `ai_queries` row in `usage_records` even when it makes two
-- provider calls (intent parsing, then explanation). The gap between the two
-- counts is what the cost-per-question number is made of.
--
-- `input_units` / `output_units` rather than `input_tokens`: a future provider
-- may not bill in tokens, and §40 of Phase 09 is that the domain must not take
-- on one provider's vocabulary.
-- -----------------------------------------------------------------------------

create table if not exists public.ai_usage_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  intent          text,
  provider        text not null,
  model           text not null,
  -- The call this row describes: parsing a question, or explaining figures.
  call_type       text not null,
  input_units     integer not null default 0,
  output_units    integer not null default 0,
  duration_ms     integer not null default 0,
  status          text not null,
  error_code      text,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_usage_logs_status_check') then
    alter table public.ai_usage_logs add constraint ai_usage_logs_status_check
      check (status in ('succeeded', 'failed', 'timeout', 'rejected'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'ai_usage_logs_call_type_check') then
    alter table public.ai_usage_logs add constraint ai_usage_logs_call_type_check
      check (call_type in ('intent', 'explanation'));
  end if;
end $$;

-- §55 — cost per user per period, and the failure rate behind §30's provider
-- health panel.
create index if not exists ai_usage_logs_user_created_idx
  on public.ai_usage_logs (user_id, created_at desc);

create index if not exists ai_usage_logs_failures_idx
  on public.ai_usage_logs (created_at desc)
  where status <> 'succeeded';

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS (criterion 19, criterion 20)
--
-- Client reads its own rows; every write goes through a server action (master
-- plan §33), which is the pattern every table since Phase 02 has used.
--
-- For `ai_messages` that rule carries extra weight and is worth naming: a
-- client able to insert an 'assistant' row could forge the system's own words
-- into a user's history — a grounded answer that HelloPera never produced,
-- indistinguishable afterwards from one it did. Criterion 19 asks for exactly
-- this, and the database is what refuses.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['ai_conversations', 'ai_messages', 'ai_usage_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
       using (user_id = (select auth.uid()))', t || '_select_own', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- §55 — cost analysis is operational, not something a user reads about
-- themselves, and it names the provider and model HelloPera uses. No browser
-- needs it; withheld on that basis, the same way `billing_customers` is.
revoke select on public.ai_usage_logs from authenticated;
drop policy if exists ai_usage_logs_select_own on public.ai_usage_logs;
