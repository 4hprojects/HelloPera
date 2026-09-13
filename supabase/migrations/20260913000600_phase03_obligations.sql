-- =============================================================================
-- Phase 03 — Bills, Receivables and Expected Income
--
-- CORE MODELLING RULE (§4):
--   An obligation is not a transaction. A bill is not an expense; a receivable
--   is not income; expected income is not income. Only actual money movement
--   creates a transaction. Link tables record which transaction settled which
--   obligation, and by how much.
--
-- STATUS (§9, §38):
--   Persisted:  open | partially_paid | paid | cancelled   — lifecycle
--   Derived:    upcoming | due_soon | due_today | overdue   — time
--
--   Time-based states are computed at read time from due_date and the
--   remaining amount. Storing them would mean a daily job whose only purpose
--   is refreshing a label, and a label that is silently wrong between runs.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- bills
-- -----------------------------------------------------------------------------

create table if not exists public.bills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider_name text not null,
  description   text,
  category_id   uuid references public.categories (id) on delete set null,
  amount        numeric(18, 2) not null,
  currency_code text not null default 'PHP',
  due_date      date not null,
  status        text not null default 'open',
  notes         text,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.bills.status is
  'Lifecycle only: open | partially_paid | paid | cancelled. Time states (due_soon, overdue) are derived at read time.';

-- -----------------------------------------------------------------------------
-- receivables
-- -----------------------------------------------------------------------------

create table if not exists public.receivables (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  party_name    text not null,
  description   text,
  amount        numeric(18, 2) not null,
  currency_code text not null default 'PHP',
  due_date      date,
  status        text not null default 'open',
  notes         text,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- expected_income
--
-- Distinct from receivables (§30): a receivable is a defined debt someone owes
-- you; expected income is anticipated money that nobody owes yet — a salary,
-- a stipend, a likely freelance payment.
-- -----------------------------------------------------------------------------

create table if not exists public.expected_income (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  source_name   text not null,
  description   text,
  category_id   uuid references public.categories (id) on delete set null,
  amount        numeric(18, 2) not null,
  currency_code text not null default 'PHP',
  expected_date date not null,
  status        text not null default 'open',
  notes         text,
  is_archived   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['bills', 'receivables', 'expected_income'] loop
    -- One persisted lifecycle vocabulary across all three, so the allocation
    -- function can stay polymorphic.
    if not exists (select 1 from pg_constraint where conname = t || '_status_check') then
      execute format(
        'alter table public.%I add constraint %I check (status in (%L,%L,%L,%L))',
        t, t || '_status_check', 'open', 'partially_paid', 'paid', 'cancelled');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_amount_check') then
      execute format('alter table public.%I add constraint %I check (amount > 0)',
                     t, t || '_amount_check');
    end if;
    if not exists (select 1 from pg_constraint where conname = t || '_currency_check') then
      execute format('alter table public.%I add constraint %I check (char_length(currency_code) = 3)',
                     t, t || '_currency_check');
    end if;
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);
  end loop;
end $$;

create index if not exists bills_user_due_idx on public.bills (user_id, due_date);
create index if not exists bills_open_idx on public.bills (user_id, due_date)
  where status in ('open', 'partially_paid');
create index if not exists receivables_user_due_idx on public.receivables (user_id, due_date);
create index if not exists receivables_open_idx on public.receivables (user_id, due_date)
  where status in ('open', 'partially_paid');
create index if not exists expected_income_user_date_idx
  on public.expected_income (user_id, expected_date);

-- -----------------------------------------------------------------------------
-- Link tables
--
-- amount_applied on both sides (§36) so one transaction can settle several
-- obligations and one obligation can take several transactions. Retrofitting
-- this shape later is painful, so it is here from the start even though the
-- MVP flow is one-to-one.
-- -----------------------------------------------------------------------------

create table if not exists public.bill_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  bill_id        uuid not null references public.bills (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete restrict,
  amount_applied numeric(18, 2) not null check (amount_applied > 0),
  created_at     timestamptz not null default now()
);

create table if not exists public.receivable_payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  receivable_id  uuid not null references public.receivables (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete restrict,
  amount_applied numeric(18, 2) not null check (amount_applied > 0),
  created_at     timestamptz not null default now()
);

create table if not exists public.expected_income_receipts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  expected_income_id uuid not null references public.expected_income (id) on delete cascade,
  transaction_id     uuid not null references public.transactions (id) on delete restrict,
  amount_applied     numeric(18, 2) not null check (amount_applied > 0),
  created_at         timestamptz not null default now()
);

create index if not exists bill_payments_bill_idx on public.bill_payments (bill_id);
create index if not exists bill_payments_tx_idx on public.bill_payments (transaction_id);
create index if not exists receivable_payments_recv_idx on public.receivable_payments (receivable_id);
create index if not exists receivable_payments_tx_idx on public.receivable_payments (transaction_id);
create index if not exists eir_expected_idx on public.expected_income_receipts (expected_income_id);
create index if not exists eir_tx_idx on public.expected_income_receipts (transaction_id);

-- -----------------------------------------------------------------------------
-- Allocation — the concurrency guard (§37, §74)
--
-- The problem this exists to prevent:
--
--   Bill remaining ₱1,000. Two ₱1,000 payments arrive together. Both read
--   "remaining 1,000", both conclude they fit, both insert. The bill ends up
--   ₱2,000 paid against a ₱1,000 obligation.
--
-- Neither invariant can be a CHECK constraint — both are aggregates across
-- rows. Application-level checks lose the race outright: between the read and
-- the write, the other request has already read the same balance.
--
-- The FOR UPDATE row lock is the mechanism. It serialises concurrent callers
-- against the same obligation, so the second reads the first's committed
-- total rather than a stale one.
-- -----------------------------------------------------------------------------

create or replace function public.allocate_payment(
  p_user_id         uuid,
  p_obligation_type text,   -- 'bill' | 'receivable' | 'expected_income'
  p_obligation_id   uuid,
  p_transaction_id  uuid,
  p_amount          numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ob_amount    numeric(18,2);
  v_ob_currency  text;
  v_ob_status    text;
  v_ob_owner     uuid;
  v_applied      numeric(18,2);
  v_tx_amount    numeric(18,2);
  v_tx_currency  text;
  v_tx_status    text;
  v_tx_owner     uuid;
  v_tx_applied   numeric(18,2);
  v_link_id      uuid;
  v_new_status   text;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_NOT_POSITIVE' using errcode = 'P0001';
  end if;
  if p_obligation_type not in ('bill', 'receivable', 'expected_income') then
    raise exception 'UNKNOWN_OBLIGATION_TYPE' using errcode = 'P0001';
  end if;

  -- Lock the obligation FIRST and hold it for the rest of the transaction.
  -- Everything below reads committed state because of this line.
  if p_obligation_type = 'bill' then
    select user_id, amount, currency_code, status
      into v_ob_owner, v_ob_amount, v_ob_currency, v_ob_status
    from public.bills where id = p_obligation_id for update;
  elsif p_obligation_type = 'receivable' then
    select user_id, amount, currency_code, status
      into v_ob_owner, v_ob_amount, v_ob_currency, v_ob_status
    from public.receivables where id = p_obligation_id for update;
  else
    select user_id, amount, currency_code, status
      into v_ob_owner, v_ob_amount, v_ob_currency, v_ob_status
    from public.expected_income where id = p_obligation_id for update;
  end if;

  if v_ob_owner is null or v_ob_owner <> p_user_id then
    -- Same error either way: a distinguishable "forbidden" confirms existence.
    raise exception 'OBLIGATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ob_status = 'cancelled' then
    raise exception 'OBLIGATION_CANCELLED' using errcode = 'P0001';
  end if;

  select user_id, amount, currency_code, status
    into v_tx_owner, v_tx_amount, v_tx_currency, v_tx_status
  from public.transactions where id = p_transaction_id for update;

  if v_tx_owner is null or v_tx_owner <> p_user_id then
    raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tx_status <> 'confirmed' then
    raise exception 'TRANSACTION_NOT_CONFIRMED' using errcode = 'P0001';
  end if;
  if v_tx_currency <> v_ob_currency then
    -- Cross-currency settlement is permanently out of scope (master plan §11).
    raise exception 'CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;

  -- Totals recomputed INSIDE the lock. This is the whole point.
  if p_obligation_type = 'bill' then
    select coalesce(sum(amount_applied), 0) into v_applied
    from public.bill_payments where bill_id = p_obligation_id;
  elsif p_obligation_type = 'receivable' then
    select coalesce(sum(amount_applied), 0) into v_applied
    from public.receivable_payments where receivable_id = p_obligation_id;
  else
    select coalesce(sum(amount_applied), 0) into v_applied
    from public.expected_income_receipts where expected_income_id = p_obligation_id;
  end if;

  if v_applied + p_amount > v_ob_amount then
    raise exception 'EXCEEDS_OBLIGATION_REMAINING' using errcode = 'P0001';
  end if;

  -- A transaction may settle several obligations, but never more than itself.
  select coalesce((
    select sum(amount_applied) from public.bill_payments where transaction_id = p_transaction_id
  ), 0) + coalesce((
    select sum(amount_applied) from public.receivable_payments where transaction_id = p_transaction_id
  ), 0) + coalesce((
    select sum(amount_applied) from public.expected_income_receipts where transaction_id = p_transaction_id
  ), 0)
  into v_tx_applied;

  if v_tx_applied + p_amount > v_tx_amount then
    raise exception 'EXCEEDS_TRANSACTION_AMOUNT' using errcode = 'P0001';
  end if;

  if p_obligation_type = 'bill' then
    insert into public.bill_payments (user_id, bill_id, transaction_id, amount_applied)
    values (p_user_id, p_obligation_id, p_transaction_id, p_amount) returning id into v_link_id;
  elsif p_obligation_type = 'receivable' then
    insert into public.receivable_payments (user_id, receivable_id, transaction_id, amount_applied)
    values (p_user_id, p_obligation_id, p_transaction_id, p_amount) returning id into v_link_id;
  else
    insert into public.expected_income_receipts
      (user_id, expected_income_id, transaction_id, amount_applied)
    values (p_user_id, p_obligation_id, p_transaction_id, p_amount) returning id into v_link_id;
  end if;

  v_applied := v_applied + p_amount;
  v_new_status := case
    when v_applied >= v_ob_amount then 'paid'
    when v_applied > 0            then 'partially_paid'
    else 'open'
  end;

  if p_obligation_type = 'bill' then
    update public.bills set status = v_new_status where id = p_obligation_id;
  elsif p_obligation_type = 'receivable' then
    update public.receivables set status = v_new_status where id = p_obligation_id;
  else
    update public.expected_income set status = v_new_status where id = p_obligation_id;
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, p_obligation_type, p_obligation_id, 'payment_linked',
     jsonb_build_object('transaction_id', p_transaction_id,
                        'amount_applied', p_amount,
                        'status', v_new_status));

  return v_link_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- unlink_payment (§55)
--
-- Removing a link never deletes the transaction — the money did move.
-- -----------------------------------------------------------------------------

create or replace function public.unlink_payment(
  p_user_id         uuid,
  p_obligation_type text,
  p_link_id         uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ob_id     uuid;
  v_owner     uuid;
  v_ob_amount numeric(18,2);
  v_applied   numeric(18,2);
  v_status    text;
begin
  if p_obligation_type = 'bill' then
    select bill_id, user_id into v_ob_id, v_owner
    from public.bill_payments where id = p_link_id;
  elsif p_obligation_type = 'receivable' then
    select receivable_id, user_id into v_ob_id, v_owner
    from public.receivable_payments where id = p_link_id;
  else
    select expected_income_id, user_id into v_ob_id, v_owner
    from public.expected_income_receipts where id = p_link_id;
  end if;

  if v_owner is null or v_owner <> p_user_id then
    raise exception 'LINK_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_obligation_type = 'bill' then
    perform 1 from public.bills where id = v_ob_id for update;
    delete from public.bill_payments where id = p_link_id;
    select amount into v_ob_amount from public.bills where id = v_ob_id;
    select coalesce(sum(amount_applied), 0) into v_applied
      from public.bill_payments where bill_id = v_ob_id;
  elsif p_obligation_type = 'receivable' then
    perform 1 from public.receivables where id = v_ob_id for update;
    delete from public.receivable_payments where id = p_link_id;
    select amount into v_ob_amount from public.receivables where id = v_ob_id;
    select coalesce(sum(amount_applied), 0) into v_applied
      from public.receivable_payments where receivable_id = v_ob_id;
  else
    perform 1 from public.expected_income where id = v_ob_id for update;
    delete from public.expected_income_receipts where id = p_link_id;
    select amount into v_ob_amount from public.expected_income where id = v_ob_id;
    select coalesce(sum(amount_applied), 0) into v_applied
      from public.expected_income_receipts where expected_income_id = v_ob_id;
  end if;

  v_status := case
    when v_applied >= v_ob_amount then 'paid'
    when v_applied > 0            then 'partially_paid'
    else 'open'
  end;

  if p_obligation_type = 'bill' then
    update public.bills set status = v_status where id = v_ob_id;
  elsif p_obligation_type = 'receivable' then
    update public.receivables set status = v_status where id = v_ob_id;
  else
    update public.expected_income set status = v_status where id = v_ob_id;
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, p_obligation_type, v_ob_id, 'payment_unlinked',
     jsonb_build_object('status', v_status));
end;
$$;

revoke all on function public.allocate_payment from anon, authenticated;
revoke all on function public.unlink_payment   from anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['bills','receivables','expected_income',
                           'bill_payments','receivable_payments','expected_income_receipts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
