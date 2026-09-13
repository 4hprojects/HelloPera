# HelloPera — Phase 11: Premium Billing

## 1. Objective

Build HelloPera's production subscription billing layer.

At the end of this phase, eligible users should be able to:

- Subscribe to Premium
- Complete checkout through the configured billing provider
- Activate Premium entitlements after verified payment
- View subscription status
- View billing period
- Cancel renewal
- Resume/reactivate where supported
- Handle renewal events
- Handle failed payments
- Enter grace period where configured
- Downgrade safely to Free
- View billing history
- Avoid duplicate webhook processing
- Preserve financial data during subscription changes

This phase turns the Phase 09 monetization model into a real paid subscription system.

---

## 2. Dependencies

Phase 11 requires Phase 10 to be complete.

Required prior capabilities:

- Free and Premium plans
- Entitlements
- Usage metering
- Subscription data model
- Subscription event model
- Billing-provider abstraction
- Feature flags
- Public pricing page
- Authentication
- RBAC
- Admin monetization views
- HelloDeploy production deployment
- Privacy/Terms pages

---

## 3. Scope

### Included

- Production billing-provider adapter
- Checkout session creation
- Premium subscription purchase
- Provider customer mapping
- Subscription creation
- Subscription renewal
- Cancellation at period end
- Immediate cancellation handling if provider supports it
- Failed payment handling
- Grace period
- Subscription expiration
- Plan downgrade
- Plan upgrade foundation
- Billing history
- Verified webhooks
- Webhook idempotency
- Subscription event processing
- Premium entitlement activation/deactivation
- Admin operational visibility
- Billing-related notifications foundation
- Audit logging

### Out of Scope

Do not implement yet:

- Family plans
- Business plans
- Referral program
- Affiliate commissions
- Coupon system unless provider requires it
- Marketplace payments
- One-time purchases
- Revenue sharing
- Complex prorated multi-plan migrations
- Tax filing/accounting automation
- Invoice customization beyond provider defaults

---

## 4. Core Principle

The billing provider is authoritative for payment status.

HelloPera is authoritative for application entitlements.

Flow:

```text
Billing Provider
↓
Verified Billing Event
↓
Subscription State
↓
Entitlement Resolution
↓
HelloPera Access
```

Do not activate Premium based only on a client-side checkout success page.

---

## 5. Billing Provider Abstraction

Phase 09 defined:

```ts
interface BillingProvider {
  createCheckoutSession(...)
  cancelSubscription(...)
  getSubscription(...)
  handleWebhook(...)
}
```

Phase 11 should implement one production provider adapter.

HelloPera business logic should depend on the abstraction, not provider-specific APIs directly.

---

## 6. Provider Selection

The production provider should be selected based on:

- Philippine payment support
- Card support
- Recurring billing support
- Webhook reliability
- Settlement
- Fees
- Developer tooling
- Subscription lifecycle support
- International expansion potential

Do not embed provider assumptions into the domain model.

---

## 7. Environment Configuration

Possible server-only variables:

```text
BILLING_PROVIDER
BILLING_SECRET_KEY
BILLING_WEBHOOK_SECRET
BILLING_PREMIUM_PRICE_ID
BILLING_SUCCESS_URL
BILLING_CANCEL_URL
```

Public keys may be exposed only if the provider requires it.

Never expose secret billing credentials to the browser.

---

## 8. Checkout Flow

Recommended flow:

```text
User opens Pricing/Plan page
↓
Select Premium
↓
Authenticated?
  No → Login/Register
  Yes → Continue
↓
Server validates selected plan
↓
Create provider checkout session
↓
Redirect to provider
↓
User completes payment
↓
Provider sends webhook
↓
HelloPera verifies event
↓
Subscription activated
↓
Entitlements refresh
```

---

## 9. Success Page

Route:

```text
/billing/success
```

The success page may show:

```text
We're confirming your subscription.
```

Do not assume Premium is active merely because user reached this page.

The page should query HelloPera subscription state.

---

## 10. Cancel Page

Route:

```text
/billing/cancelled
```

Show:

- Checkout was not completed
- Current plan remains unchanged
- Return to pricing/settings

Do not create subscription row solely from an abandoned checkout.

---

## 11. Customer Mapping

Store:

```text
provider_customer_id
```

on the subscription or a dedicated billing-customer table.

Recommended dedicated table if provider/customer lifecycle becomes complex:

```text
billing_customers

id
user_id
provider
provider_customer_id
created_at
updated_at
```

---

## 12. Subscription Table

Use Phase 09 structure:

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

## 13. Subscription Status Mapping

Normalize provider-specific states into HelloPera states:

```text
active
trialing
past_due
grace
cancelled
expired
inactive
```

Provider adapter handles mapping.

---

## 14. Webhooks

Required for authoritative subscription state.

Route example:

```text
/api/billing/webhook
```

Webhook must:

- Verify signature
- Parse event
- Check idempotency
- Process event
- Update subscription
- Write subscription event
- Refresh entitlement state if needed
- Return success only after safe processing

---

## 15. Webhook Signature Verification

Mandatory.

Never trust:

```text
event payload
```

without provider verification.

Reject invalid signatures.

---

## 16. Webhook Idempotency

Use:

```text
provider + provider_event_id
```

as unique key.

Repeated delivery must not duplicate:

- Subscription creation
- Entitlement activation
- Billing-history records
- Notifications

---

## 17. Subscription Events

Use:

```text
subscription_events
```

Suggested fields:

```text
id
user_id
subscription_id
provider
provider_event_id
event_type
payload jsonb
processed_at
processing_status
created_at
```

Avoid storing unnecessary sensitive payment data.

---

## 18. Important Event Types

Normalize events such as:

```text
checkout_completed
subscription_created
subscription_updated
subscription_renewed
payment_succeeded
payment_failed
subscription_cancel_scheduled
subscription_cancelled
subscription_expired
subscription_reactivated
```

Exact provider event names remain inside adapter.

---

## 19. Premium Activation

Activate Premium only after authoritative event.

Typical:

```text
subscription.status = active
```

Then:

```text
getEffectivePlan(user)
→ premium
```

No manual UI switch.

---

## 20. Entitlement Refresh

After subscription changes:

- Invalidate cached plan/entitlement state
- Re-resolve on next request
- Update UI promptly

Do not require user to log out/in.

---

## 21. Billing Period

Store:

```text
current_period_start
current_period_end
```

Use provider-authoritative dates.

Display in:

```text
/settings/plan
```

---

## 22. Renewal

On successful renewal:

- Update period dates
- Keep Premium active
- Write subscription event
- Optionally add billing history entry
- Reset usage according to usage-period rules if appropriate

Do not reset arbitrary monthly usage solely on payment date unless product policy says so.

---

## 23. Failed Payment

When payment fails:

Possible state:

```text
past_due
```

Then apply configured grace policy.

---

## 24. Grace Period

Suggested configurable behavior:

```text
past_due
↓
grace
↓
grace_period_end
```

During grace:

- Premium may remain active
- User sees billing warning
- User can update payment method where provider supports it

At grace expiry:

```text
effective plan → Free
```

---

## 25. Grace Period Length

Configurable.

Example placeholder:

```text
3–7 days
```

Do not hardcode until product decision.

---

## 26. Cancellation

Support:

```text
cancel_at_period_end = true
```

Recommended default cancellation behavior:

- User keeps Premium until paid period ends
- Renewal stops
- At period end, downgrade to Free

---

## 27. Immediate Cancellation

Only if provider/product requires it.

If immediate:

- Clearly warn user
- Entitlements may end immediately
- Preserve financial data

Period-end cancellation is safer for user expectations.

---

## 28. Reactivation

If cancellation is scheduled but period is still active:

Allow:

```text
Resume Subscription
```

if provider supports it.

Clear:

```text
cancel_at_period_end
```

after confirmed provider response.

---

## 29. Expiration

When subscription expires:

```text
status = expired
```

Effective plan becomes:

```text
free
```

Premium-only views/actions become restricted.

---

## 30. Downgrade Policy

Downgrade must not destroy core financial data.

Note that account **deletion** is a different thing entirely, is already
working by this phase (master plan §54a), and is the only path that removes
financial records. Downgrade restricts access; deletion removes data. Never
let one behave like the other.

Keep:

- Transactions
- Accounts
- Bills
- Receivables
- Expected income
- Historical analytics data
- Audit logs

Restrict only Premium capabilities.

---

## 31. Document Retention After Downgrade

Do not immediately delete documents.

Recommended policy:

```text
downgrade
↓
retention grace period
↓
warn user
↓
apply Free retention policy later
```

Exact cleanup may remain disabled until policy is finalized.

---

## 32. Usage After Downgrade

If Premium user has:

```text
OCR usage > Free monthly limit
```

then:

- Existing results remain
- New OCR blocked until next reset/upgrade
- Manual tracking remains available

---

## 33. Upgrade Foundation

If future higher plan exists:

- Keep provider adapter capable of plan/price switch
- Keep entitlement resolution generic

Do not implement complex proration yet.

---

## 34. Billing History Table

Suggested:

```text
billing_history

id
user_id
subscription_id
provider_invoice_id
provider_payment_id
amount
currency_code
status
billing_period_start
billing_period_end
receipt_url
created_at
```

Store only safe metadata.

---

## 35. Billing History Route

Suggested:

```text
/settings/billing
```

Show:

- Current plan
- Status
- Renewal date
- Billing period
- Payment history
- Manage subscription
- Cancel/resume

---

## 36. Provider Billing Portal

If provider supports a secure customer portal:

Use it for:

- Payment method updates
- Invoice/receipt access
- Billing details

This may reduce sensitive payment handling inside HelloPera.

---

## 37. Payment Data Handling

HelloPera should avoid storing:

- Full card number
- CVV
- Raw bank credentials

Prefer hosted checkout/provider portal.

---

## 38. PCI Scope

Use provider-hosted payment UI where possible to minimize payment-data scope.

Do not build custom card form unless truly required.

---

## 39. Billing Notifications

Possible in-app/push notifications:

```text
Premium activated
Renewal successful
Payment failed
Grace period started
Subscription cancellation scheduled
Premium ended
```

Integrate with Phase 08 notification service.

---

## 40. Billing Notification Privacy

Avoid exposing detailed payment info in push notifications.

Example:

```text
Your HelloPera Premium payment needs attention.
```

---

## 41. Audit Events

Suggested:

```text
checkout_created
subscription_activated
subscription_renewed
payment_failed
grace_started
subscription_cancel_scheduled
subscription_reactivated
subscription_expired
subscription_downgraded
```

---

## 42. Admin Subscription View

Route:

```text
/admin/subscriptions
```

Show operational fields:

- User identifier/email
- Plan
- Status
- Provider
- Current period
- Cancel state
- Grace state
- Latest billing event

Do not show private financial transactions.

---

## 43. Admin Manual Override

Avoid manual Premium overrides unless necessary.

If supported:

- Require admin
- Require reason
- Audit it
- Time-limit override where possible

Provider-paid status should remain distinct from promotional/admin access.

---

## 44. Promotional Access

Optional future model:

```text
entitlement_overrides
```

Better than falsifying subscription state.

Can be deferred.

---

## 45. RLS

Enable/maintain RLS on:

```text
subscriptions
subscription_events
billing_history
billing_customers
```

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())   -- own subscription, own billing history
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

`subscription_events` is not readable by the browser at all — it holds raw
provider payloads and exists for reconciliation and support, not for display.

Every write here originates from a signature-verified webhook (§14) or an
audited admin action (§43). There is no client path to paid status, provider
IDs or billing history, because a single successful client `INSERT` into
`subscriptions` is free Premium for life.

---

## 46. Service Role Usage

Webhook processing likely requires server-only privileged writes.

Requirements:

- Service key server-only
- Signature verified first
- Provider event validated
- User/subscription mapping validated
- Event idempotency checked

---

## 47. Checkout Security

Checkout creation endpoint must:

- Require authenticated active user
- Accept only known public plan code
- Resolve provider price server-side
- Ignore client-supplied price
- Prevent arbitrary price IDs

---

## 48. Pricing Integrity

Never trust:

```text
price_amount
price_id
plan_id
```

from browser without server validation.

The server maps:

```text
premium
→ configured provider price
```

---

## 49. Currency

Initial subscription currency may be:

```text
PHP
```

or provider-supported currency chosen by product policy.

Billing currency is separate from user's tracked financial currencies.

---

## 50. Tax

If provider handles tax:

Document it.

If tax handling is required later, add dedicated logic.

Do not invent tax calculations in Phase 11.

---

## 51. Receipts

If provider offers hosted receipt/invoice URLs:

Store reference safely.

Do not duplicate sensitive payment documents unnecessarily.

---

## 52. Subscription Management UI

Route:

```text
/settings/plan
```

Display:

```text
Current Plan
Status
Renews On
Usage
Manage Billing
Cancel Subscription
```

If Free:

```text
Upgrade to Premium
```

---

## 53. Upgrade CTA

Use non-deceptive copy.

Example:

```text
Upgrade to Premium
```

Avoid fake countdowns or urgency.

---

## 54. Cancellation UX

Before cancellation:

Explain:

- Renewal stops
- Premium continues until period end
- Data remains
- Free limits apply afterward

Require confirmation.

---

## 55. Failed Payment UX

Show:

```text
Payment needs attention
```

Actions:

```text
Manage Billing
Retry/Update Payment Method
```

depending on provider.

---

## 56. Subscription Status Badge

Examples:

```text
Premium Active
Cancellation Scheduled
Payment Past Due
Grace Period
Free
```

Use text + semantic color.

---

## 57. Checkout Idempotency

Prevent multiple checkout sessions/subscriptions caused by repeated clicks.

Possible:

- Disable button
- Reuse active checkout session where provider supports it
- Check existing active subscription first

---

## 58. Duplicate Subscription Prevention

Before checkout:

If active Premium exists:

```text
redirect to manage plan
```

Do not create second Premium subscription.

---

## 59. Concurrency

Webhook events may arrive out of order.

Subscription service must compare:

- event type
- provider timestamps/version
- current subscription state

Do not blindly let older event overwrite newer state.

---

## 60. Event Ordering Strategy

Store:

```text
provider_event_created_at
```

if available.

Use provider subscription fetch when event order is uncertain.

---

## 61. Reconciliation Job

Add periodic billing reconciliation, running on the scheduler resolved in
`PHASE-07` §2 and recording to `job_runs` under:

```text
billing_reconciliation
```

It takes the same advisory lock as every other scheduled job (`PHASE-07`
§20a) — two concurrent reconciliation runs hitting the provider API would
double the request volume for no benefit, and could apply stale state twice.

Example daily:

```text
active local subscriptions
↓
verify provider state
↓
repair mismatch
```

Do not rely exclusively on webhooks forever.

---

## 62. Reconciliation Scope

Check:

- Active subscriptions
- Past due
- Cancellation scheduled
- Recently changed subscriptions

Avoid unnecessary provider API volume.

---

## 63. Webhook Failure Recovery

If event processing fails:

- Store failed event
- Return appropriate error so provider retries when safe
- Allow admin/worker replay
- Preserve idempotency

---

## 64. Dead-Letter Foundation

Optional:

```text
processing_status = failed
error_code
retry_count
```

for subscription events.

Full queue/DLQ infrastructure may remain future work.

---

## 65. Billing Metrics

Admin may see:

```text
Active Premium Users
Past Due
Grace
Cancelled This Period
```

Avoid financial revenue dashboards unless needed.

---

## 66. Revenue Metrics

Optional:

- MRR
- Active subscriptions
- Churn

Can be added later.

Do not block Phase 11 completion.

---

## 67. Feature Flag

Require:

```text
billing_enabled
```

When false:

- Upgrade CTA disabled/hidden
- Existing active subscriptions should still resolve correctly if production migration needs it

---

## 68. Sandbox/Test Mode

Billing provider should support development/testing mode.

Separate:

```text
test credentials
production credentials
```

Never mix.

---

## 69. Environment Separation

At minimum:

```text
development
production
```

Prefer staging before live billing.

Each environment should have:

- Own webhook secret
- Own price/product IDs
- Own callback URLs

---

## 70. Webhook Endpoint URL

Production example:

```text
https://<hellopera-domain>/api/billing/webhook
```

Must be HTTPS.

Verify row Q3 of `PLATFORM-HELLODEPLOY.md`: the endpoint has to be reachable
by the provider **through Cloudflare**. Bot protection challenging a webhook
POST is a common and confusing failure — the provider sees a 403, retries,
and eventually disables the endpoint, while nothing in HelloPera's logs shows
a request arriving.

Send a signed test event from the provider dashboard before relying on it.

---

## 71. Logging

Log safely:

```text
provider_event_id
event_type
subscription_id
processing_status
error_code
```

Do not log:

- Card details
- Billing secrets
- Full provider payload unless securely necessary

---

## 72. Error Handling

User-facing examples:

```text
Unable to start checkout.
Your subscription is already active.
We are still confirming your payment.
Your payment needs attention.
Unable to cancel subscription.
```

Avoid showing provider stack traces.

---

## 73. Accessibility

Billing UI should support:

- Keyboard navigation
- Clear status text
- Accessible confirmation dialog
- Non-color-only state
- Proper form labels

---

## 74. Testing Checklist

### Checkout

- [ ] Authenticated Free user can start checkout
- [ ] Unauthenticated user redirected to login
- [ ] Existing Premium user cannot duplicate subscribe
- [ ] Client cannot change price
- [ ] Checkout success returns correctly
- [ ] Checkout cancel returns correctly

### Webhooks

- [ ] Valid signature accepted
- [ ] Invalid signature rejected
- [ ] Duplicate event ignored safely
- [ ] Subscription created event works
- [ ] Renewal event works
- [ ] Payment failed event works
- [ ] Cancellation event works
- [ ] Expiration event works

### Premium Activation

- [ ] Client success page alone does not activate Premium
- [ ] Verified provider event activates Premium
- [ ] Entitlements refresh without relogin
- [ ] Ads disabled for Premium

### Renewal

- [ ] Period dates update
- [ ] Premium remains active
- [ ] Billing history updated

### Failed Payment

- [ ] Past-due state set
- [ ] Grace policy works
- [ ] Warning shown
- [ ] Grace expiry downgrades safely

### Cancellation

- [ ] Cancel at period end works
- [ ] Premium remains until period end
- [ ] Resume works if supported
- [ ] Expiry downgrades to Free

### Downgrade

- [ ] Financial records preserved
- [ ] OCR results preserved
- [ ] Premium features restricted
- [ ] Free usage limits enforced
- [ ] No immediate destructive document deletion

### Billing History

- [ ] User can view own history
- [ ] User A cannot view User B history
- [ ] Receipt URL safe

### Admin

- [ ] Admin can view operational subscription status
- [ ] Regular user cannot access admin billing route
- [ ] Admin cannot access private financial data through billing UI

### Security

- [ ] Billing secret not exposed
- [ ] Webhook secret not exposed
- [ ] Client cannot self-upgrade
- [ ] Arbitrary price IDs rejected
- [ ] RLS enforced, browser SELECT only
- [ ] Direct anon-key INSERT into `subscriptions` is refused by the database
- [ ] Direct anon-key UPDATE of `billing_history` is refused
- [ ] `subscription_events` is not readable by the browser

### Production

- [ ] Live/test environment separated
- [ ] Production checkout works
- [ ] Production webhook works
- [ ] HelloDeploy handles webhook endpoint
- [ ] Cloudflare does not block provider webhook
- [ ] Reconciliation job works

---

## 75. Deployment Checks

Before completing Phase 11:

- [ ] Production billing provider selected
- [ ] Provider account configured
- [ ] Premium product/price created
- [ ] Production secrets added to HelloDeploy
- [ ] Webhook secret configured
- [ ] Checkout URLs configured
- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] Billing migrations applied
- [ ] RLS reviewed
- [ ] Test-mode checkout passed
- [ ] Test-mode renewal passed
- [ ] Test-mode failed payment passed
- [ ] Cancellation tested
- [ ] Webhook replay tested
- [ ] Event order handling tested
- [ ] Billing reconciliation scheduled
- [ ] Production build succeeds
- [ ] Live billing remains feature-flagged until launch approval

---

## 76. Acceptance Criteria

Phase 11 is complete only when:

1. Free users can start Premium checkout.
2. Checkout is created server-side.
3. Pricing cannot be manipulated client-side.
4. Billing provider is accessed through an adapter.
5. Premium activates only from authoritative verified billing state.
6. Webhook signatures are verified.
7. Duplicate webhooks are idempotent.
8. Active Premium resolves Premium entitlements.
9. Renewal updates the billing period.
10. Failed payments create the correct state.
11. Grace period works if configured.
12. Cancellation at period end works.
13. Reactivation works where supported.
14. Expired subscriptions downgrade to Free.
15. Downgrade preserves core financial data.
16. Premium users remain ad-free.
17. Billing history is available to the user.
18. Users cannot read another user's billing data.
19. Admin can view operational subscription status.
20. Billing events are auditable.
21. Provider state can be reconciled periodically, via `job_runs`.
22. Direct client writes to billing tables are refused by the database.
23. Test and production billing configurations are separated.
24. HelloPera does not store raw card credentials.

---

## 77. Definition of Done

Phase 11 is considered done when:

```text
HelloPera can securely sell,
activate,
renew,
cancel,
recover,
and expire Premium subscriptions
through a verified billing provider
while preserving user financial data
and keeping application entitlements authoritative.
```

The application should then be ready to begin:

```text
Phase 12 — AI Financial Assistant
```

Do not proceed to Phase 12 until all Phase 11 acceptance criteria pass.
