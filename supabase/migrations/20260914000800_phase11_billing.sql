-- =============================================================================
-- Phase 11 — Premium Billing: customer mapping and payment history
--
-- The provider-independent half. No adapter, no checkout, no provider names:
-- §6 leaves provider selection open and §40 of Phase 09 forbids baking one
-- into the domain model, so `provider` is a plain text column and everything
-- provider-shaped lives in `subscription_events.payload`.
--
-- ## What is deliberately NOT stored
--
-- §37, §38 and criterion 24: HelloPera never stores a card number, a CVV, an
-- expiry, or bank credentials. The provider's hosted checkout and portal hold
-- those, which is what keeps this application out of PCI scope entirely. The
-- columns below are amounts, dates, opaque provider ids and a receipt URL —
-- enough to show someone their own billing history and nothing more.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- billing_customers (§11)
--
-- One row per user per provider. Exists because a provider identifies people
-- by its own customer id, and a webhook arrives carrying that id and nothing
-- else — without this table there is no way back to a HelloPera user.
-- -----------------------------------------------------------------------------

create table if not exists public.billing_customers (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  provider             text not null,
  provider_customer_id text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- The lookup a webhook performs: provider + their id -> our user.
create unique index if not exists billing_customers_provider_customer_uidx
  on public.billing_customers (provider, provider_customer_id);

-- One customer record per provider per user. A second would make "which
-- customer is this person?" ambiguous at exactly the moment money moves.
create unique index if not exists billing_customers_user_provider_uidx
  on public.billing_customers (user_id, provider);

-- -----------------------------------------------------------------------------
-- billing_history (§34)
-- -----------------------------------------------------------------------------

create table if not exists public.billing_history (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  subscription_id       uuid references public.subscriptions (id) on delete set null,
  provider              text not null,
  provider_invoice_id   text,
  provider_payment_id   text,
  amount                numeric(18, 2) not null,
  currency_code         text not null default 'PHP',
  status                text not null,
  billing_period_start  timestamptz,
  billing_period_end    timestamptz,
  receipt_url           text,
  created_at            timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'billing_history_status_check'
  ) then
    alter table public.billing_history add constraint billing_history_status_check
      check (status in ('paid', 'failed', 'refunded', 'pending'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'billing_history_amount_check'
  ) then
    -- Zero is legitimate (a fully discounted period); negative is not — a
    -- refund is its own status, not a negative charge.
    alter table public.billing_history add constraint billing_history_amount_check
      check (amount >= 0);
  end if;
end $$;

-- §16, criterion 7 — a replayed webhook must not write a second invoice row.
-- Partial, because a provider may deliver a payment with no invoice id.
create unique index if not exists billing_history_invoice_uidx
  on public.billing_history (provider, provider_invoice_id)
  where provider_invoice_id is not null;

-- The billing history page: newest first, per user.
create index if not exists billing_history_user_created_idx
  on public.billing_history (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at
-- -----------------------------------------------------------------------------

drop trigger if exists billing_customers_set_updated_at on public.billing_customers;
create trigger billing_customers_set_updated_at
  before update on public.billing_customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS (criterion 18, criterion 22)
--
-- SELECT own rows, and no write policy of any kind. Billing rows are written
-- by the webhook handler using the secret key, after a verified signature —
-- there is no client-reachable path, and criterion 22 asks for the database to
-- be the thing that refuses rather than the application.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['billing_customers', 'billing_history'] loop
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

-- §11 — billing_customers holds a provider's customer id. It is not secret,
-- but it is also nothing a browser needs: the mapping is only ever used
-- server-side to turn a webhook into a user. Withheld on that basis.
revoke select on public.billing_customers from authenticated;
drop policy if exists billing_customers_select_own on public.billing_customers;
