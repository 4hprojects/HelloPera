# Phase 11 — implementation notes

What was built, what was deliberately not built, and the decisions a reader of
`PHASE-11-PREMIUM-BILLING.md` would otherwise have to reverse-engineer.

Phase 11 cannot be finished in the repository. §6 leaves the provider
unchosen, and activation needs a provider account, a public HTTPS URL for the
webhook, and Phase 10's launch gate — none of which is code. What *can* exist
without a provider is everything that does not touch one, which is what this
phase delivered.

---

## 1. What shipped, and what is still a slot

**Shipped**

| Piece | Where |
|---|---|
| `billing_customers`, `billing_history` | `supabase/migrations/20260914000800_phase11_billing.sql` |
| Subscription state machine | `lib/billing/lifecycle.ts` (+ 26 tests) |
| Normalised invoice and event shapes | `lib/billing/provider.ts` |
| Webhook processing and reconciliation | `services/billing-webhook.service.ts` |
| Webhook endpoint | `app/api/billing/webhook/route.ts` |
| Billing page | `app/(app)/settings/billing/page.tsx` |
| Provider cancellation on account deletion | `services/account-deletion.service.ts` |

**Still a slot**

- The adapter itself. `NoopBillingProvider` remains active, so the webhook
  endpoint verifies nothing and therefore accepts nothing.
- Checkout session creation (§8) — it is the adapter's method.
- Proration (§33), which the phase document itself defers.
- Destructive retention cleanup after downgrade (§31), which stays disabled
  until the policy exists.

## 2. Nothing downstream may see a provider's vocabulary

§40 of Phase 09 forbids provider detail in business logic, and the enforcement
is structural rather than a rule to remember: the adapter converts to
`BillingEvent`, `ProviderSubscription` and `NormalisedInvoice` before anything
domain-side runs. An event type this application does not model is recorded
and ignored — never guessed at.

The practical consequence is that `services/billing-webhook.service.ts` never
reads `payload`. It stores it as the audit record of what arrived and works
only from the normalised fields. If a handler ever needs to dig a value out of
`payload`, that is the signal that the adapter's contract is missing a field.

## 3. Idempotency is the database's, not the application's

Providers retry. A webhook arriving twice is the normal case.

"Have we seen this event?" answered in application code is a race — two
deliveries, two instances, both read "no", both process, the customer is
charged twice in the history table. So the event row is **claimed first** with
an insert that `subscription_events`'s `(provider, provider_event_id)` unique
index rejects for the loser. Whoever wins the insert does the work.

Claim-first has one failure mode, and it is handled: if processing throws
*after* the claim, a naive "already seen, skip" would mean that event is never
applied — someone who paid stays on Free. So a duplicate is examined, and one
whose stored status is `pending` or `failed` is retried. Only `processed` and
`ignored` are genuinely skipped.

Verified against a real Postgres: the second insert of `evt_1` fails with
`23505`, and so does a replayed invoice id.

## 4. Entitlement is a question about time, not just status

`grantsPaidPlan()` in `lib/monetization/entitlements.ts` answers from the
status column alone. `entitlesPremium()` in `lib/billing/lifecycle.ts` adds the
two cases it cannot see:

- **Grace that has run out.** The row still says `grace` because no job has
  swept it. Reading that as entitled means a customer who stopped paying keeps
  Premium for as long as the reconciliation job is broken. It reads as *not*
  entitled the moment the deadline passes.
- **Cancelled but still inside the paid period** (§26). They asked to stop
  renewing and have already paid for the time remaining. Taking it early takes
  something they bought.

The read path is therefore correct without any job having run. The
reconciliation sweep (`expireStaleSubscriptions`, §29) exists only to make the
stored state agree with reality so admin views are not misleading — a broken
sweep makes reporting stale, never entitlement wrong. A test asserts the two
never disagree in the dangerous direction.

## 5. Downgrade restricts; it never deletes

§30 says downgrade and deletion must never behave alike. `downgradeEffect()`
returns that policy as data — `deletes: []`, `deletesDocuments: false`,
`keepsExistingUsage: true` — specifically so a test can assert it, rather than
the claim living only in a comment above code that could drift.

## 6. Card data has no column to live in

§37, §38 and criterion 24 forbid storing card numbers, CVV, expiry or bank
credentials. The way that promise is kept is that no field exists for them:
`billing_history` holds amounts, dates, opaque provider ids, a status and a
receipt URL.

A schema query in the verification run asserts no column anywhere in `public`
matches `card|cvv|cvc|pan|iban|account_number|expiry|exp_month|exp_year|last4`.
It passes, and it will fail loudly if someone later adds one.

## 7. The endpoint fails closed, and its status codes are instructions

With no adapter configured, `handleWebhook` returns null and the route answers
401 to everything. A POST to `/api/billing/webhook` on the current build is
refused; a GET is 405.

Status codes are read by the provider as retry instructions, so:

- bad signature → **401**, permanently (retrying cannot fix it);
- processed, ignored, or already seen → **200** (no redelivery wanted);
- a genuine server fault → **500**, which is the only case where redelivery
  helps — and the event row is left `failed`, which the service treats as
  retryable rather than a duplicate to skip.

The route reads `request.text()`, never `request.json()`. Every provider signs
the raw bytes, and a parse-then-restringify changes them. This is the single
most common way a webhook integration fails.

## 8. Deleting an account now has to stop the money first

PHASE-14 §70 says the billing subscription should be handled first, and before
Phase 11 there was nothing to handle. Now there is: deleting the auth user
removes the local `subscriptions` row, but the provider has never heard of that
and keeps charging the card. The person who deleted their account then pays for
a product they can no longer sign into.

So `deleteAccount` cancels at the provider before touching anything local, and
a live provider that refuses is a hard stop — nothing has been destroyed at
that point, so the operation is still fully recoverable. It is silent for Free
users and for deployments with no provider, who must not be blocked by a
billing system that was never switched on.

`billing_customers` and `billing_history` cascade from `auth.users` like every
other user-owned table. §71 permits a retention exception for legal or
accounting records, but there is no policy yet and §72 forbids keeping full
financial data for convenience — so deleting matches what the privacy page
currently promises. Retaining invoices later is a deliberate migration plus a
privacy-page change, not a silently surviving table.

## 9. Grace length is a default, not a constant

§25 says "do not hardcode until product decision". `DEFAULT_GRACE_DAYS = 7` is
therefore a parameter with a default, and `graceEndsAt(failedAt, days)` takes
an override. Seven is the generous end of §25's 3–7 range: the common cause is
an expired card, and the person fixing it usually has to notice an email first.

A test asserts the value stays inside 3–7, so a future change is a decision
rather than a typo.

## 10. Verification

Run against a real Postgres (`embedded-postgres`, all 19 migrations applied
from scratch), not asserted from reading the SQL:

- 15 schema checks pass: `authenticated` is refused INSERT, UPDATE and DELETE
  on both tables (criterion 22); `billing_customers` is not readable by
  browsers at all; RLS is enabled *and* forced; a user sees their own history
  and none of anyone else's; replayed events and replayed invoice ids are
  rejected; a negative amount is rejected; the migration re-runs without
  destroying rows.
- The deletion cascade removes both billing tables and leaves the
  `subscription_events` row with a null actor (§72).
- 26 lifecycle tests; 578 in the suite overall.

## 11. The header was overflowing on every phone

Not Phase 11, but found by it. Sharing the public header with `/register` and
`/login` put it under a measurement pass, and it turned out the single flex row
could not fit a 320px viewport: the logo is ~140px and the theme toggle ~165px
against the 288px left after gutters. The landing page scrolled sideways by
237px at 320px, 197px at 360px, and 143px at 414px — on a product whose primary
audience is phones.

The header now wraps, with explicit `order` putting the nav and the theme
toggle on their own row below the logo and the call-to-action. Measured with a
headless Chrome at 320, 360, 414 and 768: no horizontal scroll at any width,
nav visible at all of them.
