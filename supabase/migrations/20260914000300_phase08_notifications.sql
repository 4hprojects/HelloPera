-- =============================================================================
-- Phase 08 — Notifications and Automation
--
-- Creates: notifications, notification_preferences, push_subscriptions.
--
-- ## The rule this schema exists to enforce
--
-- A notification INFORMS. It never changes financial state (§4): it does not
-- create a transaction, mark a bill paid, collect a receivable, move a balance
-- or confirm an extraction. Nothing here writes to a financial table, and the
-- generator added in the next migration only reads them.
--
-- ## Deduplication is a constraint, not a convention
--
-- `unique (user_id, dedupe_key)` is what makes the scheduler safe to run twice
-- (§18, §59, §61). The application's own checks are an optimisation; this is
-- the guarantee, and it holds even when two scheduler instances race.
--
-- The key shape carries the CADENCE, not just the subject (§17) — this is the
-- part that is easy to get wrong:
--
--   bill:<id>:due_soon:<due_date>      fires once, because the date occurs once
--   bill:<id>:overdue:<step>           fires once per escalation step
--
-- `due_date < today` stays true forever and the scheduler runs hourly, so
-- `bill:<id>:overdue` would fire exactly once and never escalate, while
-- `bill:<id>:overdue:<today>` would fire every single day. Keying on the
-- escalation step (§48) gives three reminders over a month, each sent once.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notifications (§7)
-- -----------------------------------------------------------------------------

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  type            text not null,
  -- Populated when the text is actually SENT over push, so there is a record
  -- of the wording a user received. In-app rows render from `metadata` at read
  -- time instead — copy is presentation, and freezing it at generation time
  -- would mean a wording fix never reached notifications already queued.
  title           text,
  message         text,
  entity_type     text,
  entity_id       uuid,
  -- When the reminder becomes due to send. Quiet hours (§31) move this
  -- forward rather than dropping the row.
  scheduled_for   timestamptz not null default now(),
  channel         text not null default 'in_app',
  dedupe_key      text not null,
  delivery_status text not null default 'pending',
  delivered_at    timestamptz,
  read_at         timestamptz,
  -- §63 — a reminder about a bill due last March helps nobody.
  expires_at      timestamptz,
  -- The facts the copy is rendered from: provider name, amount, day counts.
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_type_check') then
    alter table public.notifications add constraint notifications_type_check
      check (type in (
        'bill_due_soon', 'bill_due_today', 'bill_overdue',
        'receivable_due_soon', 'receivable_overdue',
        'expected_income_upcoming', 'expected_income_missed',
        'recurring_event_upcoming',
        'ocr_review_required',
        'forecast_shortfall'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notifications_channel_check') then
    alter table public.notifications add constraint notifications_channel_check
      check (channel in ('in_app', 'push'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notifications_status_check') then
    alter table public.notifications add constraint notifications_status_check
      check (delivery_status in ('pending', 'sent', 'failed', 'skipped'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'notifications_entity_type_check') then
    alter table public.notifications add constraint notifications_entity_type_check
      check (entity_type is null or entity_type in (
        'bill', 'receivable', 'expected_income', 'expected_event',
        'extraction', 'forecast'
      ));
  end if;
end $$;

-- §18 — the deduplication guarantee.
create unique index if not exists notifications_dedupe_uidx
  on public.notifications (user_id, dedupe_key);

-- §66 — the notification centre reads newest first, per user.
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- §20 — the unread badge. Partial, because read rows are the majority over
-- time and the badge only ever counts unread ones.
create index if not exists notifications_unread_idx
  on public.notifications (user_id)
  where read_at is null;

-- The delivery worker's worklist.
create index if not exists notifications_pending_idx
  on public.notifications (scheduled_for)
  where delivery_status = 'pending';

-- -----------------------------------------------------------------------------
-- notification_preferences (§8, §9)
--
-- One row per user. Defaults are deliberately non-intrusive: every in-app
-- reminder on, push OFF until the browser permission is explicitly granted
-- (§13, §26) — a push default of true would be a permission prompt the user
-- never asked for.
-- -----------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users (id) on delete cascade,

  bill_due_soon       boolean not null default true,
  bill_overdue        boolean not null default true,
  receivable_due_soon boolean not null default true,
  receivable_overdue  boolean not null default true,
  expected_income     boolean not null default true,
  recurring_events    boolean not null default true,
  ocr_review          boolean not null default true,
  forecast_shortfall  boolean not null default true,

  in_app_enabled      boolean not null default true,
  push_enabled        boolean not null default false,

  quiet_hours_enabled boolean not null default false,
  -- Local clock times, interpreted in `timezone` below (§33).
  quiet_hours_start   time not null default '22:00',
  quiet_hours_end     time not null default '07:00',
  -- Denormalised from profiles so the scheduler needs one join, not two.
  timezone            text not null default 'Asia/Manila',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists notification_preferences_user_idx
  on public.notification_preferences (user_id);

-- -----------------------------------------------------------------------------
-- push_subscriptions (§24, §25)
--
-- Delivery credentials. `p256dh` and `auth` are the browser's encryption keys:
-- anyone holding them plus the VAPID private key can push to that device, so
-- the browser role gets no access to this table at all beyond its own rows,
-- and never writes them (§21).
-- -----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  endpoint        text not null,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  is_active       boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  -- §60 — three strikes and the subscription is disabled rather than retried
  -- forever. A browser that has revoked permission returns 410 permanently.
  failure_count   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- §27 — one row per device. The endpoint is the device identity, and a
-- re-subscribe on the same device must update rather than duplicate.
create unique index if not exists push_subscriptions_endpoint_uidx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_active_idx
  on public.push_subscriptions (user_id)
  where is_active;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_preferences', 'push_subscriptions'] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    -- notifications has no updated_at; only the two that do get the trigger.
    if t <> 'notifications' then
      execute format(
        'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at()', t, t);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- RLS (§54)
--
-- Browser SELECT on own rows only. No INSERT/UPDATE/DELETE policy for the
-- browser role: every write goes through a server action (master plan §33).
--
-- That includes marking a notification read (§21) — it looks harmless enough
-- to hand the browser an UPDATE policy, but a policy allowing `read_at` would
-- have to allow the row, and nothing in Postgres restricts an UPDATE policy to
-- one column. A server action is the narrower tool.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['notifications', 'notification_preferences', 'push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I_select_own on public.%I', t, t);
    execute format(
      'create policy %I_select_own on public.%I for select to authenticated
       using (user_id = (select auth.uid()))', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- §25 — push credentials are never readable by the browser, not even the
-- user's own. The device list in /settings/notifications (§51) is served by a
-- server action that returns user_agent and dates, never the keys.
revoke select on public.push_subscriptions from authenticated;
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
