# Phase 09 — implementation notes

Decisions taken while building the monetization foundation that a reader of
`PHASE-09-MONETIZATION-FOUNDATION.md` would otherwise have to
reverse-engineer.

---

## 1. `usage_records` was owed by Phase 05 and never built

`PHASE-05` §60 and `DATA-MODEL.md` both say Phase 05 creates this table with
exactly the shape Phase 09 needs, so Phase 09 could add enforcement without a
migration or a backfill. It was never created.

Phase 09 creates it. That is safe — nothing had written to it, so there is no
data to reconcile — and it closes a Phase 05 acceptance criterion that had been
quietly false.

## 2. Free is the absence of a row

§11 offers two models and recommends this one. Beyond the simplicity argument,
it has a property worth naming: **the fail-closed path is the same as the
default path.** If subscription lookup breaks, the answer is already Free —
there is no row to fail to find, no state to misread. §53's "do not accidentally
grant premium" is not a check that has to be remembered; it is what happens
when nothing works.

## 3. Two failure directions, deliberately opposite

`getUsage` **fails closed**: an unreadable counter throws rather than returning
zero. Treating a failed read as zero would hand unlimited provider calls to
anyone who could make that read fail, which is the kind of bug that only shows
up on the invoice.

`recordUsage` **fails open**: a metering error is logged and swallowed. By the
time it runs, the provider call has already happened — failing the user's
operation because bookkeeping failed would destroy a result they already paid
for, to fix a number.

The asymmetry is the point: before the money is spent, protect the platform;
after it is spent, protect the user.

## 4. Where the OCR meter sits, and why exactly there

§17's rule is precise, and the whole of its correctness is placement:

```
Request rejected before the provider is called   -> not counted
Provider invoked, any outcome                    -> counted once
Retry caused by a HelloPera fault                -> not counted again
Retry requested by the user                      -> counted
```

In `runExtraction`:

- **The quota gate is before the `ocr_jobs` insert.** Not merely before the
  provider — before the job row too, so a refused request leaves no record
  implying an attempt that never happened.
- **`recordUsage` is after the storage download and immediately before
  `provider.extract()`.** After the download, so a storage failure — squarely
  HelloPera's fault — does not count. Before `extract()`, so a provider *error*
  still does: it cost money, and the user gets a clear failure rather than a
  silent charge.

This is also why `ocr_jobs.attempt_count` and `usage_records.quantity`
deliberately diverge. The first tracks what was sent to the provider; the
second tracks what the user is charged against quota. §17 asks for that gap to
be preserved because it is the measure of HelloPera's own reliability.

## 5. The entitlement is a number, not a boolean

§9 lists `forecast_enabled`; `DATA-MODEL.md` says `forecast_horizon_days`; §24
resolves it in favour of the number, and that is the right call for a reason
worth restating: raising a limit becomes a data change rather than a deploy.

`allowedHorizons()` then filters Phase 07's fixed 30/60/90 set by the
entitlement, which makes criterion 7 structural. Even a mis-seeded entitlement
of 365 cannot produce a 365-day forecast, because the engine implements three
horizons and the filter can only ever remove from that list.

## 6. `ads_shown`, never `ads_enabled`

§27 is emphatic and the reason is operational, not stylistic. Phase 10 and
Phase 13 define `ads_enabled_global` — a system-wide kill switch. A per-user
entitlement called `ads_enabled` would sit one word away from it with the
opposite scope, and the moment they get confused is an incident, which is
exactly when the kill switch matters.

A test asserts the migration contains no bare `'ads_enabled'`.

## 7. Enforcement is server-side, and unavailable options stay visible

§20: "Do not rely only on disabled UI. Server must enforce entitlements."

`/forecast` clamps a hand-typed `?horizon=90` to what the plan permits, so the
URL is not an upgrade path. But the unavailable horizons still *render*, as
labelled disabled controls rather than vanishing — §21's point. A user cannot
decide that an upgrade is worth paying for if they never learn the longer view
exists.

## 8. The no-op billing provider does nothing honestly

It returns `null` for a checkout session rather than a plausible fake one, and
refuses webhooks outright rather than accepting unverified events.

A mock that returned success would let a checkout flow appear to work all the
way through development and fail only in production, with real money involved.
`isLive: false` lets the UI say "coming soon" instead of offering a button that
goes nowhere.

## 9. `billing_enabled = false` overrides the subscription row

While the flag is off, `getEffectivePlan` resolves Free for everyone — even a
user with an `active` premium row.

That is what makes §52's monetization-disabled mode genuinely safe rather than
nominally supported: a stray subscription row, inserted by an operator testing
something, cannot switch on features that are not ready to be sold.

## 10. What admin may see

§48 draws the line: "Admin should not use monetization role to access private
financial content."

`/admin/subscriptions` shows counts and configuration — subscriptions by
status, subscribers per plan, feature flags, aggregate metered usage, and
pending webhook events. There is no route from that page to a balance, a
transaction or a receipt, and that is a design constraint rather than an
unimplemented feature.

Entitlement editing stays out of the UI (§45): one edit changes every user on a
plan at once, so it remains migration-driven until there is an audited admin
action worth trusting with it.

## 11. Verified against a real database

The migration was executed against a real Postgres, not reviewed:

- All 16 migrations apply cleanly from scratch; both plans seed with 10
  entitlements each.
- **Criterion 17 holds.** As the `authenticated` role, every one of these was
  refused: INSERT a premium subscription, UPDATE a usage quantity, INSERT a
  usage row, UPDATE an entitlement value, INSERT a feature flag, SELECT feature
  flags, and call `increment_usage` directly.
- `plans` and `plan_entitlements` remain readable by `authenticated`, which the
  plan and pricing pages need.
- **§31 atomicity**: seeded at 29, then 20 concurrent `increment_usage` calls
  produced exactly 49 in a single row. A read-then-write implementation loses
  precisely this race, and it is the one §31 describes.
- A user with no subscription row resolves Free; premium seeds `ads_shown =
  false`, a 90-day horizon and 500 scans.

## 12. Still unverified

- **Nothing applied to the remote project.** The verification above ran against
  a local throwaway database, and the outstanding item from Phases 07–08 is
  unchanged.
- **No page rendered in a browser.** `/settings/plan`, `/pricing` and
  `/admin/subscriptions` compile and build but have not been loaded, because
  the Phase 07–09 tables do not exist remotely yet.
- **§46 audit events are not emitted.** The event names are specified and the
  audit helper already accepts a domain entity type (widened in Phase 07), but
  nothing writes `plan_changed` or `subscription_status_changed` — there is no
  path that changes a subscription yet. Phase 11 introduces the webhook that
  makes those transitions real, and that is the natural place to emit them.
