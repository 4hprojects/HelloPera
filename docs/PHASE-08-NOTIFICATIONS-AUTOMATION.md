# HelloPera — Phase 08: Notifications and Automation

## 1. Objective

Build HelloPera's notification and automation layer.

At the end of this phase, an authenticated user should be able to:

- Receive reminders for bills due soon
- Receive overdue bill reminders
- Receive receivable due/overdue reminders
- Receive expected-income reminders
- Receive recurring-event reminders
- Receive OCR review reminders where appropriate
- Configure notification preferences
- Receive in-app notifications
- Receive PWA push notifications where supported
- Avoid duplicate notifications
- See notification history
- Mark notifications as read
- Enable/disable categories of notifications
- Support scheduled background processing safely

This phase should automate reminders without altering financial records automatically.

---

## 2. Dependencies

Phase 08 requires Phase 07 to be complete.

Required prior capabilities:

- Bills
- Receivables
- Expected income
- Recurring rules
- Forecasting
- OCR jobs
- User authentication
- RLS
- Audit logging
- PWA foundation
- HelloDeploy production deployment

---

## 3. Scope

### Included

- Notification records
- In-app notification center
- Notification preferences
- Due-soon reminders
- Overdue reminders
- Receivable reminders
- Expected-income reminders
- Recurring-event reminders
- OCR-review reminders
- PWA push notification foundation
- Push subscription storage
- Scheduled jobs
- Idempotent notification generation
- Notification delivery status
- Read/unread state
- Retry handling
- Quiet-hour foundation
- User opt-out controls
- Background processing architecture

### Out of Scope

Do not implement yet:

- Email marketing campaigns
- SMS notifications
- WhatsApp
- Messenger
- AI-generated reminder copy
- Subscription billing notifications
- Ad-related notifications
- Shared-family notifications
- Enterprise notification workflows
- High-volume distributed queue architecture unless needed

---

## 4. Core Principle

Notifications should inform.

They must not silently:

- Create transactions
- Mark bills paid
- Collect receivables
- Change account balances
- Confirm OCR extractions

User action remains required for financial state changes.

---

## 5. Notification Types

Suggested initial types:

```text
bill_due_soon
bill_due_today
bill_overdue

receivable_due_soon
receivable_overdue

expected_income_upcoming
expected_income_missed

recurring_event_upcoming

ocr_review_required

forecast_shortfall
```

Optional:

```text
account_negative_balance
```

but only if useful and not noisy.

---

## 6. Notification Channels

Initial channels:

```text
in_app
push
```

Future channels:

```text
email
sms
```

Do not add future channels until needed.

---

## 7. Notifications Table

Suggested schema:

```text
notifications

id
user_id
type
title
message
entity_type
entity_id
scheduled_for
created_at
read_at
delivered_at
delivery_status
channel
dedupe_key
metadata jsonb
```

Suggested delivery statuses:

```text
pending
sent
failed
skipped
```

---

## 8. Notification Preferences Table

Suggested schema:

```text
notification_preferences

id
user_id
bill_due_soon
bill_overdue
receivable_due_soon
receivable_overdue
expected_income
recurring_events
ocr_review
forecast_shortfall
push_enabled
in_app_enabled
quiet_hours_enabled
quiet_hours_start
quiet_hours_end
timezone
created_at
updated_at
```

Defaults should be sensible and non-intrusive.

---

## 9. Default Notification Preferences

Recommended defaults:

```text
bill_due_soon = true
bill_overdue = true
receivable_due_soon = true
receivable_overdue = true
expected_income = true
recurring_events = true
ocr_review = true
forecast_shortfall = true

in_app_enabled = true
push_enabled = false
```

Push should require explicit browser permission.

---

## 10. Due-Soon Windows

Use configurable defaults.

Suggested:

```text
Bills: 3 days before
Receivables: 3 days before
Expected Income: 1 day before
Recurring Event: 1 day before
```

Allow future user customization.

Do not hardcode these values in multiple places.

---

## 11. Bill Notification Logic

### Due Soon

Create when:

```text
remaining_amount > 0
AND
due_date = today + configured_due_soon_days
AND
not cancelled
```

### Due Today

Create when:

```text
remaining_amount > 0
AND
due_date = today
```

### Overdue

Create when:

```text
remaining_amount > 0
AND
due_date < today
AND
not cancelled
```

Avoid sending the same overdue reminder every scheduler run.

---

## 12. Receivable Notification Logic

### Due Soon

```text
remaining_amount > 0
AND
due_date approaches
```

### Overdue

```text
remaining_amount > 0
AND
due_date < today
```

---

## 13. Expected Income Reminder

Create when:

```text
remaining_expected_amount > 0
AND
expected_date approaches
```

Missed reminder:

```text
expected_date < today
AND
remaining_expected_amount > 0
```

---

## 14. Recurring Event Reminder

For scheduled expected events:

```text
scheduled_date approaches
AND
status = scheduled
```

Do not notify for:

```text
fulfilled
skipped
cancelled
```

---

## 15. OCR Review Reminder

Create if:

```text
extraction status = pending_review
```

and it remains unreviewed beyond a configured delay.

Suggested initial delay:

```text
24 hours
```

Do not repeatedly remind every hour.

---

## 16. Forecast Shortfall Notification

Optional but valuable.

Create if forecast changes from:

```text
no projected shortfall
```

to:

```text
projected shortfall within configured horizon
```

Avoid repeated notifications if nothing materially changed.

---

## 17. Notification Deduplication

Every generated reminder needs a deterministic `dedupe_key`, with a unique
constraint on:

```text
user_id + dedupe_key
```

### Key Shape Must Carry the Cadence

The key has to encode not just *what* the reminder is about but *which
occurrence of it* — otherwise a recurring evaluation either fires every run
or exactly once, forever.

```text
bill:<bill_id>:due_soon:<due_date>
bill:<bill_id>:due_today:<due_date>
bill:<bill_id>:overdue:<escalation_step>

receivable:<receivable_id>:due_soon:<due_date>
receivable:<receivable_id>:overdue:<escalation_step>

expected_income:<id>:upcoming:<expected_date>
expected_income:<id>:missed:<expected_date>

recurring_event:<event_id>:upcoming:<scheduled_date>

ocr_review:<extraction_id>:<reminder_number>

forecast_shortfall:<user_id>:<first_shortfall_date>
```

### Why Overdue Differs

Date-anchored reminders — due soon, due today, upcoming — fire once because
their date occurs once.

Overdue has no such anchor. The condition `due_date < today` stays true
indefinitely, and the scheduler runs hourly (§35). A key of
`bill:<id>:overdue` would fire exactly once and never escalate; a key of
`bill:<id>:overdue:<today>` would fire every single day.

So overdue keys on the **escalation step** from §48:

```text
bill:42:overdue:1      first day overdue
bill:42:overdue:7      one week
bill:42:overdue:30     one month
```

Three reminders over a month, each sent once, with the ladder configurable.

The forecast key uses the shortfall date so that a materially different
shortfall notifies again while an unchanged one stays quiet (§64).

---

## 18. Notification Idempotency

Running scheduler twice must not create two copies of the same reminder.

Mandatory.

---

## 19. In-App Notification Center

Route:

```text
/notifications
```

Show:

- Title
- Message
- Date/time
- Read/unread
- Related entity
- Action link

Examples:

```text
Internet bill is due in 3 days
View Bill
```

```text
Client payment is overdue
View Receivable
```

---

## 20. Notification Badge

Navigation may show unread count.

Example:

```text
Notifications (3)
```

Do not make badge count expensive to calculate.

Use efficient query.

---

## 21. Mark as Read

Support:

```text
mark one read
mark all read
```

Do not delete notification when read.

---

## 22. Notification Retention

Keep notification history for a reasonable period.

Suggested initial:

```text
90 days
```

Could be longer.

Retention should be configurable.

Do not allow notification table to grow unbounded forever.

---

## 23. Push Notifications

Use web push/PWA push where supported.

Requirements:

- Service worker
- Browser permission
- Push subscription
- Server-side push delivery
- Opt-out

Do not request permission immediately on first page load.

Ask after user context makes sense.

---

## 24. Push Subscription Table

Suggested:

```text
push_subscriptions

id
user_id
endpoint
p256dh
auth
user_agent
is_active
created_at
updated_at
last_success_at
last_failure_at
```

Protect these values.

---

## 25. Push Subscription Security

Users can only manage their own subscriptions.

Do not expose all push endpoints to client queries.

Use server-side delivery.

---

## 26. Push Permission UX

Recommended:

```text
Enable reminders on this device?
```

Explain benefit first.

Then browser permission prompt.

If denied:

- Respect choice
- Keep in-app notifications available
- Do not repeatedly nag

---

## 27. Multiple Devices

Support multiple active push subscriptions per user.

Example:

```text
phone
desktop
tablet
```

One user may receive push on all opted-in devices.

---

## 28. Failed Push Subscription

If provider returns permanent invalid subscription:

```text
mark subscription inactive
```

Do not retry forever.

---

## 29. Push Payload

Keep push payload minimal.

Avoid sensitive financial details on lock screens by default.

Safer example:

```text
HelloPera
You have a bill due soon.
```

rather than:

```text
You owe ₱47,500 on Account 1234
```

Allow richer content only with future privacy settings.

---

## 30. Notification Privacy

Default notification text should minimize sensitive data exposure.

Especially for push notifications.

In-app messages can be more detailed after authenticated access.

---

## 31. Quiet Hours

Foundation should support:

```text
quiet_hours_start
quiet_hours_end
timezone
```

Suggested default:

```text
disabled
```

Future users may enable:

```text
22:00–07:00
```

---

## 32. Quiet-Hour Behavior

During quiet hours:

- In-app notification may still be created
- Push delivery may be delayed

Do not lose the reminder.

---

## 33. User Timezone

Default:

```text
Asia/Manila
```

Notification scheduling should respect user timezone.

Future users may configure timezone.

---

## 34. Scheduler

Use the mechanism resolved in `PHASE-07` §2. Do not introduce a second
scheduling approach — one mechanism, several job types.

Reminder jobs record their runs in `job_runs` and take the advisory lock
described in `PHASE-07` §20a:

```text
notification_generation
notification_delivery
```

This is why that infrastructure lands in Phase 07 rather than Phase 13: by
the time Phase 08 adds hourly jobs alongside Phase 07's daily generation,
overlap protection has to already exist.

---

## 35. Scheduler Frequency

Suggested:

```text
hourly
```

Confirm row S1 of `PLATFORM-HELLODEPLOY.md` supports hourly granularity. Some
schedulers only offer daily, which is too coarse for due-today reminders — if
so, adopt the `pg_cron` fallback from `PHASE-07` §2.

for general reminder evaluation.

Daily-only may be too coarse for due-today logic.

Do not schedule more frequently than needed.

---

## 36. Scheduler Responsibilities

Scheduled job may:

```text
generate bill reminders
generate receivable reminders
generate expected-income reminders
generate recurring-event reminders
generate OCR-review reminders
generate forecast-shortfall reminders
dispatch pending push notifications
clean expired notifications
```

Keep each task modular.

---

## 37. Background Job Architecture

Initial:

```text
Scheduler
↓
Notification Service
↓
Database
↓
Push Delivery
```

Future if workload grows:

```text
Scheduler
↓
Redis/BullMQ
↓
Workers
```

Do not introduce queue infrastructure just because it is available.

---

## 38. When to Introduce BullMQ

Introduce only if:

- Push delivery becomes slow
- OCR jobs compete with reminder jobs
- Retry complexity grows
- Scheduler jobs exceed acceptable runtime
- Multiple workers are needed

Until then, simpler scheduled tasks are better.

---

## 39. Notification Service

Suggested:

```text
services/
  notification.service.ts
  notification-preference.service.ts
  push.service.ts
  scheduler.service.ts
```

---

## 40. Suggested Functions

Conceptual:

```text
generateDueNotifications()
generateOverdueNotifications()
generateOCRReviewNotifications()
generateForecastNotifications()
createNotification()
sendPushNotification()
markNotificationRead()
markAllNotificationsRead()
```

---

## 41. Delivery Flow

```text
Scheduler
↓
Find qualifying event
↓
Build dedupe key
↓
Create notification if not exists
↓
Check preferences
↓
Create in-app notification
↓
If push enabled:
    send push
↓
Update delivery status
```

---

## 42. Preference Check

Before delivery:

- User status must be active
- Notification type enabled
- Channel enabled
- Quiet hours respected

---

## 43. Suspended/Disabled Users

Do not send normal financial push notifications to:

```text
suspended
disabled
```

unless there is a future account-status communication requirement.

---

## 44. Notification Action Links

Each notification should link to a safe app route.

Examples:

```text
/bills/[id]
/receivables/[id]
/expected-income/[id]
/documents/[id]/review
/forecast
```

Validate entity ownership after navigation.

---

## 45. Deep Linking

PWA push click should open:

- Existing HelloPera window if available
- Otherwise new app window

Route user to related entity.

---

## 46. PWA Service Worker

Phase 08 may extend Phase 00 service worker for push events.

Requirements:

- push event handling
- notification click handling
- safe route opening
- versioning/update behavior

Do not cache sensitive API data broadly.

---

## 47. Notification Copy

Use concise language.

Examples:

```text
Your internet bill is due in 3 days.
```

```text
A receivable is now overdue.
```

```text
An uploaded document still needs your review.
```

Avoid judgmental or alarming wording.

---

## 48. Reminder Escalation

Initial simple pattern:

```text
due soon
due today
overdue
```

Do not send daily overdue reminders indefinitely.

Possible escalation:

```text
first overdue day
7 days overdue
30 days overdue
```

Keep configurable.

---

## 49. Repeated Notification Control

Create per-type cadence rules.

Example:

```text
bill_overdue
max one reminder per configured interval
```

This reduces notification fatigue.

---

## 50. Notification Settings Route

Suggested:

```text
/settings/notifications
```

Controls:

- In-app enabled
- Push enabled
- Bill reminders
- Receivable reminders
- Expected income reminders
- Recurring event reminders
- OCR review reminders
- Forecast warnings
- Quiet hours

---

## 51. Device Management

Optional but useful:

```text
/settings/notifications/devices
```

Show:

- Device/browser label
- Last active
- Push enabled
- Remove

Can be deferred if time is limited.

---

## 52. Audit Logging

Suggested events:

```text
notification_preferences_updated
push_subscription_created
push_subscription_disabled
notification_created
notification_sent
notification_failed
notification_read
```

Do not flood audit logs with every internal retry if unnecessary.

Operational logs may be better for low-level delivery attempts.

---

## 53. Operational Logging

Log:

```text
notification_id
type
channel
delivery status
duration
safe error code
```

Do not log:

- push auth secrets
- sensitive financial message body if avoidable

---

## 54. RLS

Enable RLS on:

```text
notifications
notification_preferences
push_subscriptions
```

Policy shape, per the write-path rule (master plan §33):

```text
SELECT   where user_id = (select auth.uid())
INSERT   no policy for the browser role
UPDATE   no policy for the browser role
DELETE   no policy for the browser role
```

Two writes look like exceptions and are not:

- **Marking a notification read** is a server action that sets `read_at` on a
  row it has verified the user owns. It is not a client `UPDATE`.
- **Saving notification preferences** is a server action with a field
  allowlist, so a client cannot write an unknown column.

`push_subscriptions` in particular must never be client-writable: the
endpoint and keys are delivery credentials, and a client able to insert
arbitrary rows could direct another user's reminders to its own endpoint.

---

## 55. Server-Only Push Delivery

Push sending must be server-side.

Do not expose server push credentials or VAPID private key to client.

---

## 56. Web Push Configuration

May require:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
```

Public key may be exposed as intended.

Private key must remain server-only.

---

## 57. Environment Variables

Possible:

```text
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
NOTIFICATION_SCHEDULER_SECRET
```

Do not commit real values.

---

## 58. Scheduler Endpoint Security

If HelloDeploy cron calls an HTTP endpoint:

- Require secret/token
- Restrict method
- Rate limit if useful
- Do not expose publicly usable scheduler action

---

## 59. Idempotent Scheduler

Every scheduler run must be safe to repeat.

Mandatory.

---

## 60. Retry Policy

Push delivery may retry transient failures.

Suggested:

```text
max 3 attempts
```

Permanent invalid subscription should disable subscription.

Do not retry indefinitely.

---

## 61. Concurrency

Two scheduler instances may run at the same time.

Three guards, in order of authority:

1. **Unique constraint** on `user_id + dedupe_key` (§17). This is the
   guarantee — a duplicate insert fails at the database regardless of what
   the application believed.
2. **Advisory lock** per job type (`PHASE-07` §20a). Stops the second run
   doing the work at all.
3. **Transactional create.** Keeps a partially written notification from
   being delivered.

Ship all three. The constraint alone is correct but wasteful; the lock alone
is fast but losable.

---

## 62. Notification Read State

Use:

```text
read_at nullable
```

Unread:

```text
read_at = null
```

Read:

```text
read_at = timestamp
```

---

## 63. Notification Expiration

Optional:

```text
expires_at
```

Useful for stale reminders.

Example:

A due-soon notification may remain in history but no longer need push retry after due date.

---

## 64. Forecast Notification Logic

Do not notify on every forecast recalculation.

Only create when meaningful condition changes.

Example:

```text
no shortfall
→
shortfall within 30 days
```

or shortfall date shifts materially earlier.

---

## 65. OCR Reminder Logic

Do not remind immediately after upload.

Suggested:

```text
pending_review for 24 hours
```

then one reminder.

Optional second reminder after:

```text
72 hours
```

---

## 66. In-App Notification Ordering

Default:

```text
unread first
then newest first
```

Allow:

```text
all
unread
```

filters.

---

## 67. Notification Pagination

Use pagination/infinite list.

Do not load thousands of notification rows at once.

---

## 68. Empty State

Example:

```text
You're all caught up.
No new notifications.
```

---

## 69. Accessibility

Notification center should support:

- Screen-reader labels
- Read/unread text state
- Keyboard navigation
- Accessible action links
- No color-only unread indicator

---

## 70. Mobile UX

On mobile:

- Notification list should be compact
- Actions easy to tap
- Deep links should return cleanly
- Push permission prompt should be contextual

---

## 71. Desktop UX

Desktop may use:

- Notification dropdown
- Full notification center route

Avoid hiding full history only inside a tiny popover.

---

## 72. Data Retention

Suggested:

```text
notification history: 90 days
delivery logs: shorter, e.g. 30 days
```

Exact policy configurable.

---

## 73. Cleanup Job

Scheduled cleanup may:

- Delete expired operational delivery attempts
- Archive old read notifications
- Remove inactive push subscriptions
- Preserve user-facing history according to policy

---

## 74. Testing Checklist

### In-App Notifications

- [ ] Bill due-soon notification created
- [ ] Bill due-today notification created
- [ ] Bill overdue notification created
- [ ] Receivable reminder created
- [ ] Expected-income reminder created
- [ ] OCR review reminder created
- [ ] Forecast shortfall reminder created
- [ ] Read/unread works
- [ ] Mark all read works

### Deduplication

- [ ] Scheduler run twice creates one reminder
- [ ] Concurrent scheduler run does not duplicate
- [ ] Dedupe key unique per event/cadence
- [ ] Overdue reminder fires once per escalation step, not hourly
- [ ] Overdue reminder still escalates at 7 and 30 days
- [ ] An unchanged forecast shortfall does not re-notify
- [ ] A materially earlier shortfall date does re-notify

### Preferences

- [ ] Bill reminders can be disabled
- [ ] Receivable reminders can be disabled
- [ ] Push can be disabled
- [ ] In-app can be disabled if product allows
- [ ] Quiet hours respected

### Push

- [ ] Permission request works
- [ ] Subscription stored
- [ ] Push received on supported browser
- [ ] Notification click opens correct route
- [ ] Invalid subscription disabled
- [ ] Private VAPID key not exposed

### Privacy

- [ ] Push message avoids sensitive data by default
- [ ] User A cannot access User B notifications
- [ ] User A cannot access User B push subscription

### Scheduler

- [ ] Hourly scheduler runs
- [ ] Scheduler secret validated
- [ ] Suspended users skipped
- [ ] Disabled users skipped
- [ ] Retry works for transient failure

### Production

- [ ] PWA push works through HelloDeploy
- [ ] Service worker updates correctly
- [ ] Cloudflare does not block push flow
- [ ] Scheduler works in production
- [ ] Notification deep links work

---

## 75. Deployment Checks

Before completing Phase 08:

- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] Notification tables migrated
- [ ] Push subscription table migrated
- [ ] RLS enabled
- [ ] VAPID keys configured
- [ ] Scheduler configured
- [ ] Scheduler endpoint secured
- [ ] Service worker push handler deployed
- [ ] Production push tested
- [ ] Duplicate notification protection tested
- [ ] Quiet-hours logic tested
- [ ] Notification retention job configured
- [ ] Production build succeeds
- [ ] HelloDeploy deployment succeeds

---

## 76. Acceptance Criteria

Phase 08 is complete only when:

1. Users receive in-app bill reminders.
2. Users receive overdue bill reminders.
3. Users receive receivable reminders.
4. Users receive expected-income reminders.
5. Users receive recurring-event reminders.
6. Users can receive OCR-review reminders.
7. Forecast shortfall reminders work if enabled.
8. Users can configure notification preferences.
9. Users can mark notifications read.
10. Users can view notification history.
11. Push subscriptions can be created.
12. Push notifications work on supported PWA environments.
13. Push permission is opt-in.
14. Push messages avoid unnecessary sensitive details.
15. Duplicate reminders are prevented by a database constraint.
16. Overdue reminders escalate rather than repeating or firing once.
17. Scheduler is idempotent and uses Phase 07's job infrastructure.
18. Quiet hours are supported.
19. Suspended/disabled users do not receive normal financial reminders.
20. RLS protects notifications and push subscriptions, browser SELECT only.
21. Push subscriptions cannot be written by a client.
22. The system remains functional without Redis/BullMQ.
23. Architecture is ready to introduce a queue later if workload requires it.

---

## 77. Definition of Done

Phase 08 is considered done when:

```text
HelloPera can reliably and privately
remind users about important financial events
through in-app and PWA push notifications,
with configurable preferences,
scheduled automation,
and duplicate-safe delivery.
```

The application should then be ready to begin:

```text
Phase 09 — Monetization Foundation
```

Do not proceed to Phase 09 until all Phase 08 acceptance criteria pass.
