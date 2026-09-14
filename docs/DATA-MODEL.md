# HelloPera — Data Model

Consolidated schema reference. Every table, the phase that creates it, and the
phases that extend it.

Keep this current in the **same commit** as any schema migration. A schema
spread across ten phase documents drifts; a consolidated one does not.

---

## Conventions

```text
id              uuid, primary key, generated
user_id         uuid, references auth.users(id), on every user-owned table
created_at      timestamptz, default now()
updated_at      timestamptz, maintained by trigger
money           numeric(18,2) — never float or double precision
currency_code   char(3), ISO 4217, default 'PHP'
calendar dates  date, not timestamptz, where time of day is meaningless
```

### Row-Level Security

Every user-owned table carries the same policy shape (master plan §33):

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

All mutations go through server actions. Tables marked **operational** below
are not browser-readable at all.

`auth.uid()` is always wrapped in a subselect so it is evaluated once per
query rather than once per row, and every `user_id` column carries an index —
without one, RLS forces a sequential scan. See master plan §33.

---

## Phase 01 — Identity

### `profiles`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | equals `auth.users.id` |
| `email` | text | |
| `full_name` | text | |
| `avatar_url` | text | |
| `role` | text | `user` \| `admin` |
| `status` | text | `active` \| `suspended` \| `disabled` |
| `timezone` | text | default `Asia/Manila` |
| `default_currency` | char(3) | default `PHP` |
| `created_at` / `updated_at` | timestamptz | |

Created by a trigger on `auth.users`, so email and OAuth signup behave
identically. `role` and `status` have no client-writable path.

`timezone` is the single authority for date boundaries across transactions,
bill due dates, analytics months, forecast dates, usage periods and assistant
date parsing.

### `audit_logs`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `actor_user_id` | uuid | who acted |
| `target_user_id` | uuid | who was affected |
| `entity_type` | text | null for auth events |
| `entity_id` | uuid | null for auth events |
| `event_type` | text | |
| `before_data` | jsonb | null for auth events |
| `after_data` | jsonb | |
| `metadata` | jsonb | never secrets |
| `created_at` | timestamptz | |

Created in Phase 01 with this full shape so Phase 02 needs no `ALTER`.
Append-only: no `UPDATE` or `DELETE` policy for anyone.

Index: `(actor_user_id)`, `(entity_type, entity_id)`.

---

## Phase 02 — Financial Core

### `accounts`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `name` | text | |
| `type` | text | `cash`, `bank`, `gcash`, `maya`, `paypal`, `credit_card`, `loan`, `investment`, `other` |
| `nature` | text | `asset` \| `liability` |
| `currency_code` | char(3) | |
| `opening_balance` | money | **input-only — never summed** |
| `current_balance` | money | cache; recomputable from transactions |
| `institution_name` | text | |
| `is_active` / `is_archived` | boolean | |
| `created_at` / `updated_at` | timestamptz | |

`opening_balance` records what the user typed. The authoritative opening
amount is the `opening_balance` transaction. Summing both would make every
account wrong by exactly its opening amount.

Defaults: `credit_card` and `loan` → liability; everything else → asset.

Index: `(user_id)`.

### `categories`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid, nullable | null for system categories |
| `name` | text | |
| `type` | text | `income` \| `expense` \| `both` |
| `icon` | text | |
| `is_system` | boolean | |
| `is_active` | boolean | |

Seeded with the system categories in `PHASE-02` §13–14.

Index: `(user_id)`.

### `transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `type` | text | `income`, `expense`, `transfer`, `refund`, `adjustment`, `opening_balance` |
| `direction` | text | `increase` \| `decrease`; required for `adjustment` |
| `amount` | money | always > 0 — sign lives in the matrix, not the value |
| `currency_code` | char(3) | |
| `transaction_date` | date | user-local intent |
| `source_account_id` | uuid | |
| `destination_account_id` | uuid | |
| `category_id` | uuid | |
| `merchant_name` | text | |
| `description` / `notes` | text | |
| `refund_of_transaction_id` | uuid | traces a refund to its purchase |
| `transfer_group_id` | uuid | optional |
| `status` | text | `confirmed` \| `voided` |
| `is_archived` | boolean | |
| `created_at` / `updated_at` | timestamptz | |

**Balance effects are defined by the matrix in `PHASE-02` §34.** Do not
re-derive them anywhere else.

Constraints:

```text
amount > 0
source_account_id != destination_account_id
direction NOT NULL when type = 'adjustment'
destination_account_id NOT NULL when type in (income, refund, opening_balance)
source_account_id NOT NULL when type in (expense, adjustment)
both accounts NOT NULL when type = 'transfer'
```

Index: `(user_id, transaction_date)`, `(user_id, type)`, `(user_id, category_id)`, `(user_id, source_account_id)`, `(destination_account_id)`, `(status)`.

### `tags` / `transaction_tags`

```text
tags                 id, user_id, name, created_at
transaction_tags     transaction_id, tag_id   (composite PK)
```

---

## Phase 03 — Obligations

Shared pattern: an obligation holds a total; link tables hold `amount_applied`
against real transactions. Paid and remaining amounts are **derived**, never
stored.

All link rows are written exclusively by the `allocate_payment` function
(`PHASE-03` §37), which takes `SELECT … FOR UPDATE` on the obligation row.

### `bills`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `provider_name` | text | |
| `description` | text | |
| `category_id` | uuid | |
| `amount` | money | |
| `currency_code` | char(3) | |
| `due_date` | date | |
| `status` | text | `open` \| `partially_paid` \| `paid` \| `cancelled` |
| `notes` | text | |
| `is_archived` | boolean | |
| `recurring_rule_id` | uuid | added Phase 07 |
| `occurrence_date` | date | added Phase 07; unique with the rule |

`upcoming`, `due_soon`, `due_today` and `overdue` are **derived at read time**
from `due_date` and remaining amount — never stored, so no daily job is needed
to keep labels fresh.

Index: `(user_id, due_date)`, `(user_id, status)`.

### `receivables`

Same shape with `party_name` instead of `provider_name`; status
`pending` \| `partially_paid` \| `paid` \| `cancelled`. `overdue` is derived.

### `expected_income`

| Column | Notes |
|---|---|
| `source_name`, `description`, `category_id` | |
| `amount`, `currency_code`, `expected_date` | |
| `status` | `expected` \| `partially_received` \| `received` \| `cancelled` |
| `recurring_rule_id`, `occurrence_date` | added Phase 07 |

`missed` is derived from `expected_date` and remaining amount.

### Link tables

```text
bill_payments               id, user_id, bill_id, transaction_id, amount_applied, created_at
receivable_payments         id, user_id, receivable_id, transaction_id, amount_applied, created_at
expected_income_receipts    id, user_id, expected_income_id, transaction_id, amount_applied, created_at
```

Invariants enforced inside the allocation function:

```text
sum(amount_applied) per obligation  <= obligation amount
sum(amount_applied) per transaction <= transaction amount
matching currency, same user, transaction confirmed and not voided
```

---

## Phase 04 — Documents

### `documents`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | |
| `document_type` | text | receipt, screenshot, bill, invoice, statement, … |
| `original_filename` | text | metadata only — never a storage key |
| `original_mime_type`, `original_size_bytes` | | |
| `storage_bucket` | text | `hello-pera-documents`, private |
| `display_path`, `thumbnail_path`, `original_path` | text | |
| `display_mime_type`, `display_size_bytes`, `thumbnail_size_bytes` | | |
| `width`, `height`, `page_count` | int | |
| `content_hash` | text | SHA-256 of the original |
| `processing_status` | text | `uploaded` \| `processing` \| `ready` \| `failed` |
| `retention_status` | text | `original_retained` \| `original_temporary` \| `original_deleted` \| `optimized_only` |
| `is_archived` | boolean | |

Object paths begin with the owner's uuid:
`<user_uuid>/<year>/<month>/<document_uuid>/display.webp`

`retention_status` governs whether OCR can be retried — see Phase 05.

Index: `(user_id)`, `(user_id, content_hash)`, `(created_at)`, `(processing_status)`.

---

## Phase 05 — OCR and Extraction

```text
ocr_jobs            id, user_id, document_id, provider, status, attempt_count,
                    started_at, completed_at, failed_at, error_code,
                    error_message_safe, created_at, updated_at

ocr_results         id, user_id, document_id, ocr_job_id, provider, raw_text,
                    overall_confidence, provider_metadata jsonb, created_at

extraction_results  id, user_id, document_id, ocr_result_id, document_type,
                    status, structured_data jsonb, field_confidence jsonb,
                    validation_errors jsonb, created_at, updated_at

document_links      id, user_id, document_id, entity_type, entity_id, created_at
```

`ocr_jobs.status`: `queued` \| `processing` \| `completed` \| `failed` \| `cancelled`
`extraction_results.status`: `pending_review` \| `confirmed` \| `discarded` \| `failed`

`document_links.entity_type`: `transaction` \| `bill` \| `receivable` \| `expected_income`.
Many-to-many by design — one document may evidence several records, and one
record may have several documents.

Status transitions are service-owned. A client able to set
`extraction_results.status = confirmed` would bypass the review step that keeps
OCR output away from balances.

### `usage_records` — created here, enforced in Phase 09

```text
id, user_id, feature_key, period_start, period_end, quantity, updated_at

unique (user_id, feature_key, period_start)
```

`feature_key`: `ocr_jobs`, `ai_queries`, `document_uploads`, `exports`.

Created in Phase 05 with its final shape so Phase 09 adds enforcement without
a migration or a backfill. Counting rule: `PHASE-09` §17.

### Optional

```text
duplicate_candidates     id, user_id, document_id, candidate_entity_type,
                         candidate_entity_id, score, reasons jsonb, status
extraction_corrections   id, user_id, extraction_result_id, field_name,
                         original_value, corrected_value, created_at
```

Both may be deferred. `extraction_corrections` holds user financial data —
apply the same retention rules as documents.

---

## Phase 07 — Recurring and Forecasting

### `recurring_rules`

```text
id, user_id, rule_type, name, description, amount, currency_code,
frequency, interval_count, day_of_month, day_of_week,
start_date, end_date, next_occurrence_date,
account_id, category_id, provider_name, source_name,
is_active, is_paused, created_at, updated_at
```

`rule_type`: `income` \| `expense` \| `bill` \| `expected_income`
`frequency`: `weekly` \| `biweekly` \| `monthly` \| `quarterly` \| `yearly`

Month-end rule: a `day_of_month` beyond the month's length uses the last valid
day (31st → Feb 28/29).

### `expected_events`

```text
id, user_id, recurring_rule_id, event_type, name, amount, currency_code,
scheduled_date, status, account_id, category_id, include_in_forecast,
detached_from_rule, source_entity_type, source_entity_id,
actual_transaction_id, created_at, updated_at

unique (recurring_rule_id, scheduled_date) where recurring_rule_id is not null
```

`status`: `scheduled` \| `fulfilled` \| `skipped` \| `cancelled`

The uniqueness constraint is what makes generation idempotent. Recurring
`bill` and `expected_income` rules create native records in those tables
instead, keyed by `(recurring_rule_id, occurrence_date)`.

`detached_from_rule` protects a user's manual edit from being overwritten by
the next regeneration.

`source_entity_type` is `bill` \| `expected_income` \| `transaction`, naming
the table a materialised event lives in. A row is `fulfilled` if and only if
`actual_transaction_id` is set — enforced as a cross-field check, so the two
cannot disagree.

There is no `overdue` status: like Phase 03's obligations, lateness is derived
at read time. Storing it would need a daily job whose only purpose is
refreshing a label, and between runs the label would be wrong exactly when it
matters.

### `job_runs` — operational

```text
id, job_type, status, started_at, completed_at, duration_ms,
error_code, metadata jsonb
```

`status`: `running` \| `succeeded` \| `failed` \| `partial`

Job types: `recurring_generation` (P07), `notification_generation`,
`notification_delivery` (P08), `billing_reconciliation` (P11),
`storage_cleanup` (P13), `document_retention` (P14).

Not user-owned and not browser-readable. Each job takes
`pg_try_advisory_lock(hashtext(job_type))` so concurrent runs cannot overlap.

### Generation functions — Phase 07

```text
occurrence_at(frequency, interval_count, start_date,
              day_of_month, day_of_week, step) -> date
generate_occurrence(rule_id, occurrence_date)  -> uuid | null
advance_rule_cursor(rule_id, next)             -> void
run_recurring_generation(horizon_days = 90,
                         user_id = null)       -> jsonb
```

All `security definer`, `search_path = ''`, revoked from `anon` and
`authenticated` — reachable only through a server action using the secret key.

`occurrence_at` duplicates `lib/recurring/schedule.ts` because the scheduler
runs inside Postgres (P07 §2). `lib/recurring/sql-parity.test.ts` holds the two
implementations to the same answers.

`run_recurring_generation` takes the advisory lock, does the work and releases
it **within one call**, rather than across the separate `begin_job` /
`finish_job` round trips — a session-level lock taken and released on two
different pooled connections would leak. It resolves "today" per user from
`profiles.timezone`, never from the scheduler's own UTC clock.

Scheduled hourly via `pg_cron` (`recurring_generation`). The schedule is
created inside an exception-guarded block: where `pg_cron` is unavailable the
migration still applies, and the application's on-load safety check (P07 §19)
keeps generation correct — cron affects timeliness, not correctness.

---

## Phase 08 — Notifications

```text
notifications              id, user_id, type, title, message, entity_type,
                           entity_id, scheduled_for, channel, dedupe_key,
                           delivery_status, delivered_at, read_at,
                           expires_at, metadata jsonb, created_at

                           unique (user_id, dedupe_key)

notification_preferences   id, user_id, one boolean per notification type,
                           push_enabled, in_app_enabled,
                           quiet_hours_enabled, quiet_hours_start,
                           quiet_hours_end, timezone

push_subscriptions         id, user_id, endpoint, p256dh, auth, user_agent,
                           is_active, failure_count,
                           last_success_at, last_failure_at

                           unique (endpoint)
```

`dedupe_key` shapes are specified in `PHASE-08` §17. Date-anchored reminders
key on the date; overdue reminders key on the **escalation step**, so they
neither fire hourly nor only once.

`push_subscriptions` holds delivery credentials — service-write-only, and not
client-**readable** either, not even a user's own rows: `p256dh` and `auth` are
the device's encryption keys, and with the VAPID private key they are enough to
push to that device. The device list on `/settings/notifications` is assembled
server-side from the harmless columns. The unique `endpoint` is the device
identity, so a browser re-subscribing updates rather than duplicating.

`failure_count` implements §60: a 404 or 410 from the push service disables the
subscription immediately (it is permanently gone), while transient failures
count to three.

Unread is `read_at IS NULL`.

`notifications.title`/`message` are **not** the in-app copy. In-app rows render
from `metadata` at read time via `lib/notifications/copy.ts`, so a wording fix
reaches reminders already queued; these two columns record what was actually
**sent over push**, which is a different question.

### Generation functions — Phase 08

```text
ensure_notification_preferences(user_id)     -> void
run_notification_generation(user_id = null)  -> jsonb
run_notification_cleanup()                   -> jsonb
```

All `security definer`, `search_path = ''`, revoked from `public`. They read
financial tables and write only `notifications` — a notification never changes
financial state (§4).

Scheduled via `pg_cron`: generation hourly at :05, cleanup daily at 03:30, both
inside the same exception guard Phase 07 uses. Push **delivery** cannot live in
Postgres — it needs the VAPID keys and an HTTPS request per subscription — so
it runs behind `POST /api/scheduler`, authenticated with `SCHEDULER_SECRET`.

The due-soon windows, escalation ladder and dedupe-key shapes exist in both SQL
and `lib/notifications/rules.ts`; `lib/notifications/sql-parity.test.ts` holds
them to the same values.

---

## Phase 09 — Monetization

```text
plans                id, code, name, description, is_active, is_public,
                     billing_interval, price_amount, currency_code

plan_entitlements    id, plan_id, entitlement_key, value_json

subscriptions        id, user_id, plan_id, status, provider,
                     provider_customer_id, provider_subscription_id,
                     current_period_start, current_period_end,
                     cancel_at_period_end, trial_end, grace_period_end

subscription_events  id, user_id, subscription_id, provider,
                     provider_event_id, event_type, payload jsonb,
                     processing_status, processed_at, created_at

                     unique (provider, provider_event_id)

feature_flags        id, key, enabled, config jsonb, updated_at, updated_by
```

`plans.code`: `free` \| `premium` — stable logic keys, never display names.

`subscriptions.status`: `active`, `trialing`, `past_due`, `grace`, `cancelled`,
`expired`, `inactive`. **Free users have no row** — absence resolves to Free,
which also means a failure in entitlement resolution fails closed.

Entitlement keys: `ocr_monthly_limit`, `ai_monthly_limit`, `advanced_analytics`,
`forecast_horizon_days`, `export_enabled`, `ads_shown`,
`document_retention_days`, `max_documents`, `max_accounts`, `premium_support`.

`ads_shown` is the per-user entitlement; `ads_enabled_global` is a feature
flag. An ad renders only when both permit it.

The unique key on `subscription_events` is what makes webhook replay safe.

---

## Phase 10 — Content

### `articles` — only if database-backed

```text
id, slug, title, excerpt, content, status, author_id, category,
featured_image, published_at, updated_at, seo_title, seo_description,
canonical_url, created_at
```

`status`: `draft` \| `published` \| `archived`. Only `published` appears in
public queries or the sitemap.

MDX files in the repository are a valid alternative and simpler to start with.

---

## Phase 11 — Billing

```text
billing_customers   id, user_id, provider, provider_customer_id

billing_history     id, user_id, subscription_id, provider_invoice_id,
                    provider_payment_id, amount, currency_code, status,
                    billing_period_start, billing_period_end,
                    receipt_url, created_at
```

Safe metadata only. HelloPera never stores card numbers, CVV or bank
credentials — the provider's hosted checkout and portal handle those.

---

## Phase 12 — AI Assistant

```text
ai_conversations   id, user_id, title, is_archived, created_at, updated_at

ai_messages        id, conversation_id, user_id, role, content, intent,
                   query_metadata jsonb, created_at

ai_usage_logs      id, user_id, conversation_id, intent, provider, model,
                   input_units, output_units, duration_ms, status, created_at
```

Store the question, the answer and safe intent metadata — not whole query
result payloads, raw OCR text or account numbers.

Messages are service-written. A client able to insert an assistant turn could
forge the system's own words into history.

`ai_usage_logs` tracks provider calls for cost analysis; `usage_records` tracks
the user's quota. One question is one quota unit even when it makes two
provider calls.

---

## Phase 13 — Admin Operations

```text
admin_support_notes    id, user_id, admin_user_id, note, created_at

entitlement_overrides  id, user_id, entitlement_key, value_json, reason,
                       starts_at, ends_at, created_by, created_at

usage_adjustments      id, user_id, feature_key, quantity_delta, reason,
                       created_by, created_at
```

All three exist to avoid falsifying primary records. Promotional Premium is an
`entitlement_overrides` row, not a fake subscription; a usage credit is a
`usage_adjustments` row, not an edit to history.

Operational tables: no browser access; admin reads through server actions.

---

## Creation Order

```text
Phase 01   profiles, audit_logs
Phase 02   accounts, categories, transactions, tags, transaction_tags
Phase 03   bills, bill_payments, receivables, receivable_payments,
           expected_income, expected_income_receipts
Phase 04   documents
Phase 05   ocr_jobs, ocr_results, extraction_results, document_links,
           usage_records
Phase 07   recurring_rules, expected_events, job_runs
           (+ recurring columns on bills and expected_income)
Phase 08   notifications, notification_preferences, push_subscriptions
Phase 09   plans, plan_entitlements, subscriptions, subscription_events,
           feature_flags
Phase 10   articles (optional)
Phase 11   billing_customers, billing_history
Phase 12   ai_conversations, ai_messages, ai_usage_logs
Phase 13   admin_support_notes, entitlement_overrides, usage_adjustments
```

Create tables as their phase begins — not all on day one.

---

## Deletion Cascade

Account deletion must reach every user-owned table. Extend this list in the
same commit as any new table, rather than reconstructing it from twelve phase
documents at the end.

```text
ai_messages → ai_conversations → ai_usage_logs
notifications → notification_preferences → push_subscriptions
document_links → extraction_results → ocr_results → ocr_jobs
expected_income_receipts → receivable_payments → bill_payments
expected_events → recurring_rules
expected_income → receivables → bills
transaction_tags → tags → transactions
documents (+ every storage object under <user_uuid>/)
accounts → categories (user-created only)
usage_records → subscriptions → billing_history → billing_customers
profiles → auth.users
```

Retention exceptions — billing records held for accounting or legal reasons,
minimal audit records — are documented in `PHASE-14` §71–77 and must be
reflected in the privacy policy.
