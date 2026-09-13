# HelloPera — Phase 09: Monetization Foundation

## 1. Objective

Build HelloPera's monetization foundation without activating full production billing yet.

At the end of this phase, HelloPera should support:

- Free and Premium plan definitions
- Feature entitlements
- Usage metering
- OCR usage limits
- AI usage limits foundation
- Ad eligibility
- Premium no-ads behavior
- Plan-aware feature gating
- Subscription state model
- Billing-provider abstraction
- Admin plan configuration foundation
- Graceful upgrade prompts
- Usage summaries
- Future-ready billing events

This phase should make HelloPera monetization-ready while keeping actual checkout and payment-provider integration for Phase 11.

---

## 2. Dependencies

Phase 09 requires Phase 08 to be complete.

Required prior capabilities:

- Authentication
- RBAC
- Admin shell
- Financial core
- OCR
- Notifications
- Usage counting foundations
- RLS
- Audit logging
- HelloDeploy production deployment

---

## 3. Scope

### Included

- Plans
- Plan codes
- Entitlements
- Free plan
- Premium plan
- Subscription state
- Usage counters
- Monthly usage periods
- OCR usage tracking
- AI usage placeholder
- Document-retention entitlement
- Export entitlement placeholder
- Advanced analytics entitlement
- Forecast entitlement
- Ads entitlement
- Admin plan-management foundation
- Upgrade UI
- Feature gating
- Billing-provider abstraction
- Subscription event model
- Grace period model
- Trial foundation if desired

### Out of Scope

Do not implement yet:

- Real checkout
- Payment gateway API
- Production webhooks
- Credit-card charging
- GCash billing
- Maya billing
- Invoice generation
- Refund processing
- Coupons
- Affiliate/referral system
- Family billing
- Business billing
- AdSense code injection
- AI assistant usage itself

---

## 4. Core Principle

Do not scatter plan checks throughout the application.

Avoid:

```text
if plan == premium
```

everywhere.

Use entitlements.

Example:

```text
can_use_advanced_analytics
ocr_monthly_limit
ai_monthly_limit
ads_shown
export_enabled
forecast_enabled
document_retention_days
```

---

## 5. Initial Plans

Start with:

```text
free
premium
```

Future:

```text
family
freelancer
business
```

Do not create future plans unless needed.

---

## 6. Plans Table

Suggested schema:

```text
plans

id
code
name
description
is_active
is_public
billing_interval
price_amount
currency_code
created_at
updated_at
```

For Phase 09, pricing fields may be nullable or provisional.

---

## 7. Plan Code

Use stable internal codes:

```text
free
premium
```

Do not use display names as logic keys.

---

## 8. Entitlements Table

Recommended flexible model:

```text
plan_entitlements

id
plan_id
entitlement_key
value_json
created_at
updated_at
```

Examples:

```text
ocr_monthly_limit = 30
ai_monthly_limit = 5
advanced_analytics = false
forecast_enabled = false
export_enabled = false
ads_shown = true
document_retention_days = 30
```

Premium example:

```text
ocr_monthly_limit = 500
ai_monthly_limit = 100
advanced_analytics = true
forecast_enabled = true
export_enabled = true
ads_shown = false
document_retention_days = 365
```

Values are placeholders until pricing economics are finalized.

---

## 9. Entitlement Keys

Suggested initial keys:

```text
ocr_monthly_limit
ai_monthly_limit
advanced_analytics
forecast_enabled
export_enabled
ads_shown
document_retention_days
max_documents
max_accounts
premium_support
```

Do not create arbitrary keys without documentation.

---

## 10. User Subscription Table

Suggested schema:

```text
subscriptions

id
user_id
plan_id
status
provider
provider_customer_id
provider_subscription_id
current_period_start
current_period_end
cancel_at_period_end
trial_end
grace_period_end
created_at
updated_at
```

---

## 11. Subscription Status

Suggested:

```text
active
trialing
past_due
grace
cancelled
expired
inactive
```

For Free users:

Option A:

- No subscription row
- Resolve to Free by default

Option B:

- Explicit Free subscription row

Recommended:

```text
No paid subscription row
→ resolve Free plan
```

This keeps the model simpler.

---

## 12. Plan Resolution

Create service:

```text
getEffectivePlan(userId)
```

Logic:

```text
active paid subscription?
→ paid plan

otherwise
→ free
```

Do not let client choose effective plan.

---

## 13. Entitlement Resolution

Create:

```text
getEntitlements(userId)
```

Returns normalized object.

Example:

```ts
{
  ocrMonthlyLimit: 30,
  aiMonthlyLimit: 5,
  advancedAnalytics: false,
  forecastEnabled: false,
  exportEnabled: false,
  adsShown: true,
  documentRetentionDays: 30
}
```

---

## 14. Usage Records Table

Suggested:

```text
usage_records

id
user_id
feature_key
period_start
period_end
quantity
updated_at
```

Potential unique key:

```text
user_id + feature_key + period_start
```

---

## 15. Feature Keys

Suggested:

```text
ocr_jobs
ai_queries
document_uploads
exports
```

Future:

```text
storage_bytes
```

---

## 16. Usage Period

Use calendar month initially.

Default timezone:

```text
Asia/Manila
```

Example:

```text
2026-09-01
to
2026-09-30
```

Need clear rule for users who later change timezone.

---

## 17. Usage Counting Rule

This is the authoritative rule for every metered feature. `PHASE-05` §60 and
`PHASE-12` §41 both refer here rather than restating it.

```text
Request rejected before the provider is called   → not counted
Provider invoked, any outcome                    → counted once
Retry caused by a HelloPera fault                → not counted again
Retry requested by the user                      → counted
```

The principle: **the user's quota tracks what cost money, and HelloPera's own
failures are HelloPera's problem.**

- Validation failures, file-type rejections and quota checks all happen before
  the provider call, so they cost nothing and count nothing.
- A provider call that returns an error still cost money, so it counts. The
  user gets a clear failure message, not a silent charge.
- A retry after a HelloPera timeout, deploy or bug is not the user's fault.
  Attach an operation ID to the original attempt and let the retry reuse it.
- A user choosing to re-run OCR on the same document is a new request and
  counts.

### Provider Attempts Are Tracked Separately

`ocr_jobs.attempt_count` records what was actually sent to the provider, for
cost analysis. `usage_records.quantity` records what the user is charged
against quota. They deliberately diverge when HelloPera retries its own
failures — and that gap is the measure of platform reliability, worth
watching.

---

## 18. Usage Periods

Calendar months in the user's timezone, read from `profiles.timezone`
(`PHASE-01` §9):

```text
period_start  first day of the month, 00:00 user-local
period_end    last day of the month, 23:59:59 user-local
```

Not the subscription anniversary — `PHASE-11` §22 is explicit that renewal
does not reset monthly usage.

If a user changes timezone mid-period, the current period keeps its
boundaries and the next one uses the new zone. Recomputing a period that has
already been charged against would change a number the user has already seen.

---

## 19. AI Usage

Phase 09 only establishes the model.

Actual AI assistant arrives later.

Track:

```text
ai_queries
```

when Phase 12 activates.

---

## 20. Feature Gating

Centralize.

Conceptual:

```text
requireEntitlement("forecast_enabled")
```

or:

```text
checkUsage("ocr_jobs")
```

Do not rely only on disabled UI.

Server must enforce entitlements.

---

## 21. UI Gating

UI may show:

```text
Premium
```

badge.

Example:

```text
Advanced Analytics
Premium
```

Actions:

```text
View Plans
Upgrade
```

Avoid aggressive blocking popups.

---

## 22. Free Plan Philosophy

Free should remain genuinely useful.

Recommended free access:

- Manual transactions
- Accounts
- Bills
- Receivables
- Basic analytics
- Limited OCR
- Limited AI later
- Ads

Do not make core financial tracking unusable.

---

## 23. Premium Plan Philosophy

Premium should add:

- Higher OCR usage
- No ads
- Advanced analytics
- Forecasting
- Higher AI allowance
- Exports
- Longer document retention
- More automation

---

## 24. Forecast Entitlement

Phase 07 forecast already exists.

Phase 09 may define:

```text
free
→ limited horizon

premium
→ extended forecast
```

Alternative:

```text
free = forecast disabled
premium = enabled
```

### Capped to What Phase 07 Builds

```text
Free      30 days
Premium   90 days
```

`PHASE-07` §34 implements 30/60/90 and states plainly that longer horizons
are less reliable, because they extrapolate recurring rules far past any
evidence the rules still hold.

Advertising a 12-month forecast would mean either shipping a projection the
engineering spec doubts, or selling something that does not exist. If a
longer horizon is wanted, extend Phase 07 first and raise the entitlement
second.

Keeping 30 days free matters for acquisition: a forecast the user has never
seen is one they will not pay for.

The entitlement stores a numeric horizon, so raising it later is a data
change rather than a code change.

---

## 25. Advanced Analytics Entitlement

Basic analytics stays Free.

Potential Premium:

- Longer history
- Merchant analysis
- Advanced trends
- Custom reports
- Export

Do not move essential spending visibility behind paywall.

---

## 26. Document Retention

Use:

```text
document_retention_days
```

Potential Free:

```text
30 or 90 days
```

Premium:

```text
365 or unlimited/fair use
```

Exact values not final.

Retention job must not delete user data before policy is explicitly approved.

Phase 09 should model entitlement, not necessarily enforce destructive deletion immediately.

---

## 27. Ads Entitlement

Use:

```text
ads_shown
```

Free:

```text
true
```

Premium:

```text
false
```

### Naming

The entitlement is `ads_shown`, not `ads_enabled`.

Phase 10 §54 and Phase 13 §33 define a **global kill switch** named
`ads_enabled_global`. Two controls one word apart, with opposite scopes — one
per-user, one system-wide — is a mistake waiting to happen during an incident,
which is exactly when the kill switch matters.

```text
ads_shown           per-user entitlement   false for Premium
ads_enabled_global  feature flag           false kills all ads
```

An ad renders only when both permit it.

Actual AdSense integration belongs to Phase 10.

---

## 28. Account Limits

Possible entitlement:

```text
max_accounts
```

Do not limit accounts unnecessarily unless needed for pricing.

Keep configurable.

---

## 29. Usage Check Service

Suggested:

```text
services/
  entitlement.service.ts
  usage.service.ts
  plan.service.ts
  subscription.service.ts
```

---

## 30. Suggested Functions

```text
getEffectivePlan()
getEntitlements()
canUseFeature()
getUsage()
incrementUsage()
getRemainingUsage()
isLimitReached()
```

---

## 31. Usage Atomicity

Usage increment must be atomic.

Prevent race:

```text
29/30
two OCR jobs start
```

Only allowed count should proceed if hard limit.

Use database transaction/RPC where appropriate.

---

## 32. Usage Soft Limit vs Hard Limit

Some features may use:

```text
hard limit
```

Example:

OCR.

Others may use:

```text
soft warning
```

Example:

storage.

Document per entitlement.

---

## 33. Limit Reached UX

Example:

```text
You've used your 30 OCR scans for this month.
Your limit resets on October 1.
```

Actions:

```text
View Plans
Continue Manually
```

Do not block manual transaction entry.

---

## 34. Usage Dashboard

Settings or plan page:

```text
OCR
18 / 30

AI Queries
3 / 5
```

Premium may show:

```text
18 / 500
```

---

## 35. Plan Page

Route:

```text
/settings/plan
```

Show:

- Current plan
- Features
- Usage
- Premium benefits
- Upgrade CTA

No real checkout yet.

---

## 36. Public Pricing Page

Phase 09 may create foundation:

```text
/pricing
```

Actual public marketing integration may be Phase 10.

Show only approved pricing once finalized.

Until then:

```text
Premium pricing coming soon
```

or hide pricing route.

---

## 37. Subscription Event Table

Suggested:

```text
subscription_events

id
user_id
subscription_id
provider
provider_event_id
event_type
payload jsonb
processed_at
created_at
```

This prepares for Phase 11 webhooks.

---

## 38. Subscription Event Idempotency

Unique:

```text
provider + provider_event_id
```

Required later to prevent webhook replay duplicates.

---

## 39. Billing Provider Abstraction

Define interface now.

Conceptual:

```ts
interface BillingProvider {
  createCheckoutSession(...)
  cancelSubscription(...)
  getSubscription(...)
  handleWebhook(...)
}
```

Phase 09 may use mock/no-op implementation.

---

## 40. Provider Independence

Do not bake Stripe-specific or one-provider-specific fields deeply into business logic.

Provider-specific metadata belongs in adapter layer or JSONB.

---

## 41. Trial Foundation

Optional fields:

```text
trial_end
```

Do not activate trial without product decision.

---

## 42. Grace Period

Support:

```text
grace_period_end
```

Useful later for failed payments.

During grace:

- Premium may remain temporarily active
- Billing UI warns user

Exact behavior belongs Phase 11.

---

## 43. Cancellation

Model:

```text
cancel_at_period_end
```

Premium remains active until end of paid period.

Do not immediately remove access unless product policy says so.

---

## 44. Admin Plan Foundation

Admin may view:

```text
/admin/subscriptions
/admin/usage
```

Phase 09 can show:

- Plan counts
- Active subscriptions placeholder
- Usage summary
- Plan definitions

Do not expose private financial data.

---

## 45. Admin Plan Editing

Be careful.

Changing entitlements globally may affect all users.

Require:

- Admin role
- Server validation
- Audit log

Potentially keep pricing/entitlements config migration-driven initially.

---

## 46. Audit Events

Suggested:

```text
plan_changed
subscription_created
subscription_status_changed
entitlement_updated
usage_limit_reached
admin_plan_updated
```

Do not log full provider payload if sensitive.

---

## 47. RLS

Enable RLS on:

```text
subscriptions
usage_records
```

Plans/entitlements may be public-readable or authenticated-readable depending design.

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())   -- own subscription, own usage
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

Subscription state is written only by the billing webhook handler
(`PHASE-11` §14) and usage only by the metering service.

This is the phase where client writes would be most directly profitable to
abuse: an `INSERT` into `subscriptions` is free Premium, and an `UPDATE` of
`usage_records.quantity` is an unlimited quota. Neither has a client-reachable
path.

`plans` and `plan_entitlements` are readable by authenticated users so the UI
can render tiers, and writable only by migration or an audited admin action.

---

## 48. Admin Access

Admin may access operational subscription metadata.

Admin should not use monetization role to access private financial content.

---

## 49. Service Role Usage

Subscription state updates may require server-only service role.

Keep key server-only.

Validate webhook/provider data in Phase 11.

---

## 50. Feature Flags

This phase should introduce or formalize feature flags.

Possible:

```text
premium_enabled
ads_enabled_global
ai_enabled
billing_enabled
ocr_enabled
push_enabled
```

These are system-wide kill switches, distinct from per-user entitlements.
`ads_enabled_global` turns off all advertising; `ads_shown` decides whether a
given user would have seen any.

Use for staged rollout.

---

## 51. Feature Flag Storage

Possible table:

```text
feature_flags

id
key
enabled
config jsonb
updated_at
updated_by
```

Admin-manageable later.

---

## 52. Monetization Disabled Mode

HelloPera should still function if:

```text
billing_enabled = false
```

This is useful during development.

---

## 53. Free-Plan Fallback

If entitlement service fails:

Do not accidentally grant premium.

Safe fallback:

```text
free
```

unless system availability policy says otherwise.

---

## 54. Entitlement Caching

Can cache per user briefly.

Do not globally cache private subscription state incorrectly.

Invalidate after plan changes.

---

## 55. Ad Placement Eligibility

Phase 09 only determines:

```text
adsEnabled
```

Actual rendering comes Phase 10.

Premium must resolve:

```text
adsEnabled = false
```

server-side and client-side.

---

## 56. Upgrade Prompts

Suggested locations:

- OCR limit reached
- Premium analytics click
- Forecast horizon extension
- Export action

Avoid showing upgrade prompts constantly.

---

## 57. Downgrade Behavior

Plan now for downgrade.

Questions:

- What happens to documents beyond retention limit?
- What happens to premium-only reports?
- What happens to future forecast horizon?
- What happens to exports?

Recommended:

Do not destroy data immediately.

Restrict premium access first.

Retention cleanup should have clear grace policy.

---

## 58. Data Preservation

Downgrade should not casually delete user financial records.

Potential:

- Keep transactions permanently
- Restrict premium views
- Apply document retention only after grace period

This is important for trust.

---

## 59. Testing Checklist

### Plans

- [ ] Free plan resolves by default
- [ ] Premium plan resolves for active subscription
- [ ] Inactive subscription falls back to Free
- [ ] Plan codes stable

### Entitlements

- [ ] Free entitlements load
- [ ] Premium entitlements load
- [ ] Boolean entitlement works
- [ ] Numeric entitlement works
- [ ] Server enforces entitlement
- [ ] UI reflects entitlement

### OCR Usage

- [ ] Usage increments atomically
- [ ] Limit blocks excess use
- [ ] Failed pre-provider request not counted
- [ ] Provider error still counts once
- [ ] HelloPera-caused retry does not count twice
- [ ] User-requested re-run does count
- [ ] User sees remaining limit
- [ ] Period boundaries follow `profiles.timezone`
- [ ] Reset period works

### Ads

- [ ] Free resolves ads enabled
- [ ] Premium resolves ads disabled

### Forecast

- [ ] Free/premium forecast rule respected
- [ ] Manual financial core remains accessible

### Subscriptions

- [ ] Active status recognized
- [ ] Cancelled status recognized
- [ ] Grace status modeled
- [ ] Trial status modeled if enabled

### RLS

- [ ] User A cannot read User B subscription
- [ ] User A cannot read User B usage
- [ ] User cannot create fake premium subscription
- [ ] User cannot edit own plan
- [ ] Direct anon-key INSERT into `subscriptions` is refused by the database
- [ ] Direct anon-key UPDATE of `usage_records` is refused by the database

### Admin

- [ ] Admin can view operational plan data
- [ ] Regular user cannot access admin monetization routes
- [ ] Admin still cannot access private financial data by default

### Production

- [ ] Plan resolution works through HelloDeploy
- [ ] Usage counting works
- [ ] Feature flags work
- [ ] No premium bypass through client manipulation

---

## 60. Deployment Checks

Before completing Phase 09:

- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] Plan migrations applied
- [ ] Entitlement migrations applied
- [ ] Subscription migration applied
- [ ] Usage migration applied
- [ ] RLS enabled
- [ ] Free plan seeded
- [ ] Premium plan seeded
- [ ] Entitlements seeded
- [ ] Feature flags configured
- [ ] Usage limit logic tested
- [ ] Premium bypass test passed
- [ ] Production build succeeds
- [ ] HelloDeploy deployment succeeds

---

## 61. Acceptance Criteria

Phase 09 is complete only when:

1. HelloPera has Free and Premium plan definitions.
2. Free is the safe default plan.
3. Entitlements are centrally resolved.
4. Plan logic is not scattered through UI code.
5. OCR usage can be metered under the §17 rule.
6. Usage limits can be enforced, and periods follow the user's timezone.
7. The forecast entitlement does not exceed what Phase 07 builds.
8. AI usage can be metered later without schema redesign.
9. Premium resolves `ads_shown = false`.
10. Premium features can be gated server-side.
11. Subscription states are modeled.
12. Grace/cancellation fields are available.
13. Billing-provider abstraction exists.
14. Subscription events are modeled.
15. Users can view their plan and usage.
16. Users cannot self-upgrade through client manipulation.
17. Direct client writes to subscriptions and usage are refused.
18. Admin can view operational monetization data.
19. RLS protects user subscription/usage records.
20. Downgrade policy does not casually destroy financial records.
21. HelloPera remains fully usable in monetization-disabled development mode.

---

## 62. Definition of Done

Phase 09 is considered done when:

```text
HelloPera can reliably distinguish Free and Premium capabilities,
measure costly feature usage,
enforce entitlements,
control ad eligibility,
and model subscriptions
without yet requiring a live payment provider.
```

The application should then be ready to begin:

```text
Phase 10 — Public Website, Content, SEO and AdSense
```

Do not proceed to Phase 10 until all Phase 09 acceptance criteria pass.
