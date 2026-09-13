# HelloPera — Phase 13: Admin and Operations

## 1. Objective

Build HelloPera's operational administration layer.

At the end of this phase, authorized administrators should be able to:

- View operational user accounts
- Suspend and reactivate users
- View subscription status
- View usage summaries
- Inspect OCR job failures
- Inspect AI job/provider failures
- Manage feature flags
- Manage public content operations
- Review system health
- Review background job status
- Replay safe failed operational jobs
- Review audit events
- View storage and usage metrics
- Manage plan configuration where allowed
- Perform support actions without automatically accessing private financial data

This phase should give HelloPera enough operational tooling to support real users safely.

---

## 2. Dependencies

Phase 13 requires Phase 12 to be complete.

Required prior capabilities:

- Admin RBAC
- User profiles
- Account status controls
- Subscriptions
- Usage records
- OCR jobs
- AI usage logs
- Notifications
- Feature flags
- Audit logs
- Public content foundation
- Billing events
- Background scheduling
- RLS
- HelloDeploy deployment

---

## 3. Scope

### Included

- Admin dashboard
- User management
- User status management
- Subscription operations
- Usage visibility
- OCR job operations
- AI operations
- Notification operations
- Feature flag management
- Content operations
- System health dashboard
- Background job status
- Failed-job retry tooling
- Audit-log review
- Operational metrics
- Storage metrics
- Support notes foundation
- Admin action logging
- Security boundaries
- Admin access controls

### Out of Scope

Do not implement yet:

- Full customer-support ticketing platform
- Live chat support
- Direct admin editing of user financial transactions
- Direct admin viewing of all user receipts
- Direct admin access to user AI conversations by default
- Complex enterprise roles
- Multi-tenant organization administration
- SOC/SIEM integration
- Full observability platform
- Automated incident management
- Financial accounting for HelloPera business revenue

---

## 4. Core Admin Principle

Admin access is operational.

It is not unrestricted financial-data access.

Default rule:

```text
Admin can manage the platform
without reading private user financial content.
```

---

## 5. Admin Route Group

Suggested:

```text
/admin
/admin/users
/admin/subscriptions
/admin/usage
/admin/ocr-jobs
/admin/ai
/admin/notifications
/admin/content
/admin/feature-flags
/admin/system
/admin/audit
```

All routes require:

```text
role = admin
status = active
```

---

## 6. Admin Dashboard

Route:

```text
/admin
```

Show high-level operational metrics only.

Suggested cards:

```text
Total Users
Active Users
Suspended Users
Premium Users
OCR Jobs Today
Failed OCR Jobs
AI Queries Today
Failed AI Requests
Pending Notification Jobs
System Status
```

Do not display:

```text
total user bank balances
total user expenses
individual transaction data
```

---

## 7. User Management

Route:

```text
/admin/users
```

Show:

- User ID
- Email
- Display name
- Role
- Status
- Plan
- Created date
- Last sign-in if available
- Usage summary
- Operational flags

Avoid showing:

- Transaction values
- Account balances
- Receipt images
- OCR raw text
- AI conversation contents

---

## 8. User Search

Support:

```text
email
display name
user ID
```

Avoid broad search into private financial content.

---

## 9. User Status

Statuses:

```text
active
suspended
disabled
```

Admin may:

- Suspend
- Reactivate
- Disable where policy allows

All changes must be audited.

---

## 10. Suspension

Suspension should:

- Block authenticated app usage
- Block normal push notifications
- Preserve data
- Preserve billing state unless separate action is taken
- Show appropriate suspended-account page

Suspension must not delete user records.

---

## 11. Reactivation

Reactivation restores:

```text
status = active
```

Do not alter:

- subscription
- financial records
- usage history

unless separately required.

---

## 12. Disable

Use carefully.

`disabled` should represent stronger administrative restriction.

Possible uses:

- Account abuse
- Security incident
- Legal requirement
- Account-deletion workflow state

Require reason.

---

## 13. Admin Role Assignment

Admin role changes must never be client-controlled.

Recommended:

- SQL migration
- trusted admin operation
- dedicated privileged server action

Role change must be audited.

---

## 14. Admin Cannot Self-Escalate Through UI

Regular users must not be able to:

- Set `role=admin`
- Modify status
- Modify entitlements
- Change subscription state
- Edit feature flags

---

## 15. User Detail Page

Route:

```text
/admin/users/[id]
```

Show operational data:

```text
Profile
Status
Role
Plan
Subscription Status
Usage
Created Date
Last Sign-In
Recent Operational Events
```

Do not show private finance by default.

---

## 16. Support Notes

Optional table:

```text
admin_support_notes

id
user_id
admin_user_id
note
created_at
```

Use for:

- Suspension reason
- Support context
- Billing support summary

Do not copy sensitive user financial content into notes.

---

## 17. Subscription Operations

Route:

```text
/admin/subscriptions
```

Show:

- User
- Plan
- Status
- Provider
- Current period
- Grace period
- Cancellation state
- Latest billing event

---

## 18. Subscription Actions

Admin actions may include:

- Refresh/reconcile provider state
- Replay failed billing event
- View provider customer reference
- View safe billing history
- Apply controlled entitlement override if product policy supports it

Avoid directly editing:

```text
status = active
```

without provider or explicit override model.

---

## 19. Entitlement Overrides

If needed, use dedicated table.

Suggested:

```text
entitlement_overrides

id
user_id
entitlement_key
value_json
reason
starts_at
ends_at
created_by
created_at
```

Do not falsify subscription records.

---

## 20. Usage Operations

Route:

```text
/admin/usage
```

Show aggregate and per-user operational usage:

```text
OCR jobs
AI queries
Document uploads
Storage usage
Exports
```

This is operational usage, not financial behavior.

---

## 21. Usage Filters

Support:

```text
date
feature
plan
status
user
```

---

## 22. Usage Reset

Manual usage reset should be rare.

If allowed:

- Admin only
- Require reason
- Audit
- Prefer override/credit model rather than destructive history edit

---

## 23. Usage Adjustment

Better model:

```text
usage_adjustments
```

Suggested fields:

```text
id
user_id
feature_key
quantity_delta
reason
created_by
created_at
```

This preserves history.

---

## 24. OCR Operations

Route:

```text
/admin/ocr-jobs
```

Show safe fields:

- Job ID
- User ID/email
- Document ID
- Provider
- Status
- Attempt count
- Duration
- Safe error code
- Created time

Do not show raw OCR text in list view.

---

## 25. OCR Job Detail

Route:

```text
/admin/ocr-jobs/[id]
```

Default view:

- Metadata
- Status timeline
- Provider
- Attempts
- Error code
- Processing duration
- Document technical metadata

Private content should remain hidden.

---

## 26. OCR Content Escalation

If support requires inspecting document/OCR content:

Use a separate explicit escalation mechanism.

Recommended requirements:

- Specific reason
- Admin authorization
- User support context where possible
- Audit event
- Time-limited access

Do not make content inspection routine.

---

## 27. OCR Retry

Admin may trigger safe retry for failed OCR job.

Rules:

- Verify job is retryable
- Avoid duplicate active job
- Reuse same document
- Audit action
- Respect provider limits

---

## 28. AI Operations

Route:

```text
/admin/ai
```

Show:

- Provider health
- Query count
- Failure count
- Latency
- Usage by plan
- Common intent categories
- Rate-limit events

Do not show private question text by default.

---

## 29. AI Failure Detail

Show:

- Request ID
- User ID
- Intent
- Provider
- Model
- Error code
- Duration
- Timestamp

Avoid raw prompt unless explicit support escalation.

---

## 30. AI Provider Health

Display:

```text
Operational
Degraded
Unavailable
```

based on recent request outcomes or health check.

---

## 31. Notification Operations

Route:

```text
/admin/notifications
```

Show:

- Pending
- Sent
- Failed
- Skipped
- Push subscription failures
- Scheduler status

Do not display unnecessarily sensitive notification message content.

---

## 32. Notification Retry

Admin may retry failed operational delivery.

Do not resend already-successful notifications blindly.

Respect dedupe rules.

---

## 33. Feature Flags

Route:

```text
/admin/feature-flags
```

Possible flags:

```text
billing_enabled
ads_enabled_global
ai_enabled
ocr_enabled
push_enabled
premium_enabled
```

These are system-wide kill switches. They are distinct from per-user
entitlements — `ads_enabled_global` turns advertising off for everyone, while
`ads_shown` (`PHASE-09` §27) decides whether a given user would have seen any.
An ad requires both to permit it.

---

## 34. Feature Flag Actions

Admin may:

- Enable
- Disable
- Edit safe config

Require:

- Confirmation for high-impact flags
- Audit log
- Server-side validation

---

## 35. Kill Switches

Important operational flags may act as kill switches.

Examples:

```text
ocr_enabled = false
ai_enabled = false
billing_enabled = false
```

Use during provider outage or incident.

---

## 36. Feature Flag Safety

Do not expose arbitrary executable configuration.

Use typed config schemas.

---

## 37. Content Operations

Route:

```text
/admin/content
```

Capabilities:

- Create draft
- Edit draft
- Publish
- Archive
- View SEO metadata
- Preview

Only published content appears publicly.

---

## 38. Content Audit

Log:

```text
content_created
content_updated
content_published
content_archived
```

---

## 39. System Health

Route:

```text
/admin/system
```

Show:

```text
Application
Database
Supabase Storage
OCR Provider
AI Provider
Billing Provider
Push Delivery
Scheduler
Background Jobs
```

---

## 40. Health Status

Suggested:

```text
healthy
degraded
unavailable
unknown
```

---

## 41. Health Check Rules

Health endpoints should not leak:

- secrets
- internal stack traces
- database credentials
- provider credentials

Admin page may show safe diagnostics only.

---

## 42. Application Health

Check:

- App reachable
- Database query works
- Supabase reachable
- Critical env vars present
- Migrations expected

---

## 43. Storage Health

Check:

- Private bucket reachable
- Basic metadata operation succeeds
- Signed URL generation works

Do not upload test files continuously unless needed.

---

## 44. OCR Health

Use lightweight provider health method if available.

Do not run expensive OCR merely for every page load.

---

## 45. AI Health

Use provider health/low-cost request strategy.

Avoid unnecessary paid model calls.

---

## 46. Billing Health

Check:

- Provider connectivity
- Webhook recent activity
- Reconciliation status

Do not expose billing secrets.

---

## 47. Scheduler Health

Track:

```text
last successful run
last failed run
duration
next expected run
```

for:

- recurring generation
- notifications
- billing reconciliation
- cleanup jobs

---

## 48. Background Jobs

`job_runs` already exists — it is created in `PHASE-07` §20a, alongside the
first scheduler. Phase 13 builds the admin view over it, and adds the job
types this phase introduces.

For reference, the shape:

```text
job_runs

id
job_type
status              -- running | succeeded | failed | partial
started_at
completed_at
duration_ms
error_code
metadata jsonb
```

Job types by originating phase:

```text
recurring_generation      Phase 07
notification_generation   Phase 08
notification_delivery     Phase 08
billing_reconciliation    Phase 11
storage_cleanup           Phase 13
document_retention        Phase 14
```

The table landed in Phase 07 rather than here because Phases 07, 08 and 11
each run scheduled work. Introducing overlap protection only at Phase 13 would
leave three phases running unguarded, and the first duplicate-generation bug
would arrive long before the admin screen that would have surfaced it.

---

## 49. Job Status

Suggested:

```text
running
succeeded
failed
partial
```

---

## 50. Job Replay

Admin may replay safe jobs.

Rules:

- Job must be idempotent
- Require confirmation
- Audit replay
- Avoid running duplicate concurrent job

---

## 51. Overlap Protection

Already implemented in `PHASE-07` §20a: each job type takes a Postgres
advisory lock keyed on its name, and a run that cannot acquire the lock exits
quietly.

Phase 13 adds no new mechanism. It surfaces the results — which jobs ran,
which were skipped because a run was already in flight, and which failed.

When adding a job type here or later, route it through the same helper rather
than writing bespoke locking.

---

## 52. Audit Log Viewer

Route:

```text
/admin/audit
```

Show operational audit events.

Filters:

```text
actor
event type
entity
date range
```

---

## 53. Audit Privacy

Audit payloads must not become a backdoor into private financial content.

Prefer safe summaries.

Sensitive before/after financial data should remain user-scoped or redacted in admin viewer.

---

## 54. Admin Action Audit

Every high-impact admin action should log:

```text
admin_user_id
action
target
reason
timestamp
metadata
```

Examples:

```text
user_suspended
user_reactivated
role_changed
feature_flag_changed
ocr_retry_triggered
usage_adjusted
billing_reconciliation_triggered
```

---

## 55. Admin Reason Requirement

Require reason for:

- Suspend
- Disable
- Role change
- Manual entitlement override
- Usage adjustment
- Sensitive escalation access

---

## 56. Security Events

Possible operational events:

```text
repeated failed login
suspicious rate-limit activity
invalid billing webhook
repeated admin access denial
```

A full SIEM is out of scope.

---

## 57. Admin Session Security

Admin sessions should have stronger expectations.

Potential:

- Shorter session lifetime
- Re-authentication for high-risk action
- Optional MFA later

Do not implement weak admin shortcuts.

---

## 58. MFA Foundation

Optional future-ready field:

```text
admin_mfa_required
```

Actual MFA can be added in Phase 14 if not already available through Supabase/Auth provider.

---

## 59. Admin Impersonation

Do not implement user impersonation by default.

It creates major privacy/security risk.

If ever added:

- Explicit banner
- Read-only first
- Audit
- Time-limited
- Strong authorization

---

## 60. Support Access

Prefer user-provided screenshots or controlled diagnostics rather than unrestricted impersonation.

---

## 61. Storage Metrics

Admin may view:

```text
total storage bytes
document count
average optimized size
failed processing count
```

Aggregate only.

---

## 62. Database Metrics

Admin may view:

```text
user count
transaction row count
document row count
OCR job count
AI usage count
```

Do not show private row content.

---

## 63. Provider Metrics

Track:

```text
requests
success rate
error rate
average latency
```

for:

- OCR
- AI
- Push
- Billing

---

## 64. Cost Metrics

Optional:

```text
OCR estimated cost
AI estimated cost
storage cost estimate
```

Use for operational planning.

Do not block phase completion.

---

## 65. Plan Metrics

Show:

```text
Free users
Premium users
Trialing
Past due
Grace
Cancelled
```

---

## 66. Content Metrics

Optional:

```text
published articles
draft articles
recent updates
```

Traffic analytics can remain in external analytics tool.

---

## 67. Admin Search Safety

Search should query only operational/admin-approved fields.

Do not implement global search over private financial data.

---

## 68. Pagination

All admin lists should paginate.

Examples:

```text
users
subscriptions
OCR jobs
audit logs
notifications
```

Do not load entire operational tables.

---

## 69. Export

Admin operational export may be added later.

Avoid exporting private financial data.

---

## 70. RLS and Authorization

Admin routes require server-side `requireAdmin()` on every request — not only
at the layout.

RLS still protects user-owned content. Admin is not a bypass: the browser role
holds `SELECT` on own rows only (master plan §33), and admin screens read
operational data through server actions that scope each query deliberately.

Admin operations requiring privileged access use narrowly scoped server
actions, never a general-purpose query endpoint. An admin API that accepts a
table name and a filter is a backdoor into every user's finances, however
carefully it is called today.

---

## 71. Service Role

Use only server-side.

Admin UI must never receive:

```text
SUPABASE_SERVICE_ROLE_KEY
```

---

## 72. Admin API Design

Suggested server actions/API groups:

```text
admin/users
admin/subscriptions
admin/usage
admin/ocr
admin/ai
admin/notifications
admin/system
admin/audit
```

Validate admin on every request.

---

## 73. CSRF and Mutation Safety

High-impact admin mutations should use framework-safe server actions or protected POST endpoints.

Do not use GET for destructive actions.

---

## 74. Confirmation Dialogs

Require explicit confirmation for:

- Suspend user
- Disable user
- Change role
- Retry billing event
- Change kill switch
- Usage adjustment
- Entitlement override

---

## 75. Error Handling

Admin-facing examples:

```text
Unable to suspend user.
This job is already running.
OCR retry could not be started.
Feature flag update failed.
Provider reconciliation failed.
```

Show safe diagnostic codes where useful.

---

## 76. Admin Dashboard UX

Use dense but readable operational design.

Recommended:

- Summary cards
- Status badges
- Search/filter tables
- Clear warnings
- No unnecessary charts

---

## 77. Mobile Admin

Basic responsive support is required.

However, admin workflows may prioritize desktop.

High-risk mutations should remain usable on mobile without cramped controls.

---

## 78. Accessibility

Admin interface should support:

- Keyboard navigation
- Table headers
- Proper form labels
- Clear status text
- Non-color-only indicators
- Accessible confirmation dialogs

---

## 79. Admin Navigation

Suggested:

```text
Overview
Users
Subscriptions
Usage
OCR Jobs
AI
Notifications
Content
Feature Flags
System
Audit
```

---

## 80. Admin Home Alerts

Surface:

```text
Failed OCR jobs
Failed scheduler
Billing reconciliation failure
AI provider degradation
Push delivery degradation
```

Prioritize unresolved operational issues.

---

## 81. Incident Banner

Optional:

Admin may set operational banner:

```text
OCR temporarily unavailable
```

Could be controlled by feature flag or status message table.

---

## 82. Public Status Messaging

Do not expose raw admin/system details publicly.

If user-facing status is needed, create a safe status component.

---

## 83. Testing Checklist

### RBAC

- [ ] Regular user cannot access /admin
- [ ] Suspended admin cannot access /admin
- [ ] Active admin can access
- [ ] Client role manipulation fails

### Users

- [ ] User list loads
- [ ] Search works
- [ ] Suspend works
- [ ] Reactivate works
- [ ] Disable works if enabled
- [ ] Reason required
- [ ] Action audited

### Privacy

- [ ] Admin user list does not show balances
- [ ] Admin cannot browse transactions by default
- [ ] Admin cannot browse receipts by default
- [ ] Admin cannot read AI chats by default
- [ ] Admin audit viewer does not leak sensitive payloads

### Subscriptions

- [ ] Subscription list works
- [ ] Reconciliation action works
- [ ] Failed billing event can be safely replayed
- [ ] Manual fake activation not available

### Usage

- [ ] OCR usage visible
- [ ] AI usage visible
- [ ] Usage adjustment audited
- [ ] User cannot alter usage

### OCR

- [ ] Failed jobs listed
- [ ] Safe error visible
- [ ] Retry works
- [ ] Retry does not duplicate active job
- [ ] Raw OCR hidden by default

### AI

- [ ] AI provider status visible
- [ ] Failures visible
- [ ] Private prompt content hidden by default

### Notifications

- [ ] Failed delivery visible
- [ ] Retry safe
- [ ] Already-sent notification not duplicated

### Feature Flags

- [ ] Flag list works
- [ ] Toggle works
- [ ] Invalid config rejected
- [ ] High-impact toggle requires confirmation
- [ ] Change audited

### System

- [ ] Database health works
- [ ] Storage health works
- [ ] OCR provider health works
- [ ] AI provider health works
- [ ] Billing health works
- [ ] Scheduler health works

### Jobs

- [ ] Job history visible
- [ ] Failed job visible
- [ ] Replay works
- [ ] Overlapping run prevented

### Audit

- [ ] Admin actions appear
- [ ] Filter by actor works
- [ ] Filter by event works
- [ ] Sensitive data redacted

### Production

- [ ] Admin routes work through HelloDeploy
- [ ] RLS still protects user data
- [ ] Service-role key not exposed
- [ ] Admin actions work under Cloudflare
- [ ] Production provider health checks work

---

## 84. Deployment Checks

Before completing Phase 13:

- [ ] Admin routes deployed
- [ ] Admin authorization reviewed
- [ ] Operational migrations applied
- [ ] Support-note table applied if used
- [ ] `job_runs` confirmed present from Phase 07 and covering all job types
- [ ] Feature flag admin actions secured
- [ ] Admin audit events working
- [ ] OCR retry tested
- [ ] Billing reconciliation tested
- [ ] Scheduler health tested
- [ ] Provider health checks tested
- [ ] Privacy review completed
- [ ] Service-role key remains server-only
- [ ] Production build succeeds
- [ ] HelloDeploy deployment succeeds

---

## 85. Acceptance Criteria

Phase 13 is complete only when:

1. Only active admins can access admin routes.
2. Admins can view operational user accounts.
3. Admins can suspend and reactivate users.
4. High-impact admin actions require server-side authorization.
5. Admin actions are audited.
6. Admins can view subscription operational state.
7. Admins can view usage metrics.
8. Admins can inspect failed OCR jobs without routine access to document content.
9. Admins can safely retry eligible OCR jobs.
10. Admins can view AI operational health without routine access to private conversations.
11. Admins can monitor notification delivery.
12. Admins can manage feature flags.
13. Admins can manage public content operations.
14. Admins can view system/provider health.
15. Scheduled job health is visible.
16. Safe failed jobs can be replayed.
17. Overlapping job execution is prevented.
18. Admin audit logs are searchable.
19. Service-role credentials remain server-only.
20. Admin access does not automatically bypass financial privacy.
21. Private user financial records remain protected by default.
22. The system is operationally supportable without direct database editing for routine tasks.

---

## 86. Definition of Done

Phase 13 is considered done when:

```text
HelloPera has a secure and practical
administration and operations layer
for managing users,
subscriptions,
usage,
providers,
jobs,
content,
feature flags,
and system health
without turning admin access into unrestricted access
to private financial data.
```

The application should then be ready to begin:

```text
Phase 14 — Production Hardening
```

Do not proceed to Phase 14 until all Phase 13 acceptance criteria pass.
