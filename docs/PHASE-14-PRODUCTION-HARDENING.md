# HelloPera — Phase 14: Production Hardening

## 1. Objective

Prepare HelloPera for reliable public production use.

At the end of this phase, HelloPera should have:

- Hardened security controls
- Reliable deployment and rollback procedures
- Backup and recovery processes
- Migration discipline
- Staging and production separation
- Error monitoring
- Health monitoring
- Performance safeguards
- Rate limiting
- Abuse protection
- Data-retention controls
- Account-deletion workflow
- Disaster-recovery procedures
- Secret-management discipline
- Production launch checklist
- Incident-response foundation

This phase is not about adding major new product features.

It is about making the existing HelloPera system safer, more observable, more recoverable, and easier to operate.

### Already Delivered at the Pre-Launch Gate

Master plan §54a moved a minimum set of this work **before Phase 10
published**, because taking payment and holding financial documents while
unable to demonstrate a restore is not a defensible position:

```text
Database backup confirmed
Restore tested into a non-production environment
Account deletion implemented and working
Data export implemented and working
Rate limiting on authentication endpoints
No secret reachable from the client bundle
Cross-user access tests passing
```

Phase 14 does not re-implement these. It hardens them: retention policy
enforcement, deletion grace periods and anonymisation, broader rate limiting,
disaster-recovery runbooks, and the monitoring that tells you when any of them
stops working.

Where a section below covers gate work, it says so.

---

## 2. Dependencies

Phase 14 requires all previous phases to be substantially complete.

Required capabilities:

- Authentication
- RBAC
- Financial core
- Bills and receivables
- Documents
- OCR
- Analytics
- Forecasting
- Notifications
- Monetization
- Public site
- Billing
- AI assistant
- Admin operations
- Audit logging
- HelloDeploy
- Supabase
- Cloudflare

---

## 3. Scope

### Included

- Environment separation
- Production secrets
- Deployment validation
- Migration strategy
- Rollback strategy
- Database backups
- Storage recovery plan
- Disaster recovery
- Error monitoring
- Structured logging
- Health checks
- Performance monitoring
- Rate limiting
- Security headers
- CSP
- CSRF-safe mutations
- Abuse protection
- File-upload protection review
- Webhook security review
- Dependency review
- Account deletion
- Data export
- Data-retention policy enforcement
- Recovery runbooks
- Incident response
- Production readiness review
- Launch checklist

### Out of Scope

Do not use this phase to add:

- New finance modules
- New AI features
- New payment plans
- Family accounts
- Business accounts
- Bank synchronization
- Investment execution
- Major UI redesign

---

## 4. Environment Strategy

Minimum environments:

```text
development
staging
production
```

Recommended flow:

```text
Development
↓
Staging
↓
Production
```

Do not use production as the primary testing environment.

---

## 5. Environment Isolation

Each environment should have separate:

- Supabase project or clearly isolated database
- Storage
- Auth configuration
- OAuth redirect URLs
- Billing credentials
- Billing webhook secret
- OCR credentials where practical
- AI credentials where practical
- Push keys
- Application URLs
- Feature flags

Never allow staging billing events to modify production subscription data.

---

## 6. Environment Variables

Document required variables.

Possible groups:

```text
APP
SUPABASE
GOOGLE_OAUTH
OCR
AI
BILLING
WEB_PUSH
ANALYTICS
ADS
SCHEDULER
MONITORING
```

Provide:

```text
.env.example
```

without real secrets.

---

## 7. Secret Management

Secrets must not be:

- Committed to Git
- Printed in logs
- Exposed to browser bundles
- Embedded in markdown documentation
- Stored in public issue trackers

Use HelloDeploy/server environment configuration.

---

## 8. Secret Rotation

Document rotation procedure for:

- Supabase service-role key
- Billing secret
- Webhook secret
- OCR API key
- AI API key
- VAPID private key
- Scheduler secret

High-impact secret rotation should not require code edits.

---

## 9. NEXT_PUBLIC Review

Audit every variable beginning with:

```text
NEXT_PUBLIC_
```

Only public-safe values belong there.

Never expose:

```text
service role
billing secret
OCR secret
AI secret
webhook secret
```

---

## 10. Deployment Pipeline

Recommended:

```text
Git branch / release
↓
Automated checks
↓
Build
↓
Migration validation
↓
Deploy staging
↓
Smoke test
↓
Deploy production
↓
Production smoke test
```

---

## 11. Pre-Deployment Checks

At minimum:

```text
lint
typecheck
tests
production build
migration validation
```

Do not deploy if production build fails.

---

## 12. Release Versioning

Use identifiable releases.

Possible:

```text
Git SHA
semantic version
deployment ID
```

Expose safe build metadata in admin/system page.

---

## 13. Rollback

Document:

- Application rollback
- Migration rollback limitations
- Feature-flag rollback
- Provider kill switches

Prefer forward-compatible database migrations.

---

## 14. Database Migration Principle

Use migrations for every schema change.

Do not rely on undocumented manual Supabase dashboard edits.

All production migrations should be committed.

---

## 15. Migration Safety

Prefer:

```text
expand
migrate
contract
```

for risky schema changes.

Example:

1. Add new column.
2. Deploy code supporting both old/new.
3. Backfill.
4. Switch reads.
5. Remove old column later.

Avoid destructive same-release migrations where possible.

---

## 16. Migration Backup

Before high-risk production migration:

- Confirm recent backup
- Test migration in staging
- Estimate runtime
- Plan recovery

---

## 17. Database Backups

**Gate item** — confirmed before launch. This section deepens it.

Verify actual Supabase backup capabilities for selected plan.

Document:

- Backup frequency
- Retention
- Point-in-time recovery if available
- Restore procedure

Do not merely assume backup exists.

---

## 18. Restore Test

**Gate item** — performed once before launch, and now made routine.

A backup is not enough. A backup that has never been restored is not a
backup — it is an assumption with a filename.

Periodically test:

```text
Can HelloPera actually restore?
```

Prefer restore test into non-production environment.

---

## 19. Storage Backup Strategy

Supabase Storage documents may require separate recovery planning.

Document:

- Bucket names
- Critical object paths
- Retention policy
- Export/backup process
- Restore process

Financial records may reference stored documents, so database and storage recovery must be coordinated.

---

## 20. Disaster Recovery Objectives

Define initial targets.

Example placeholders:

```text
RPO: 24 hours
RTO: 4 hours
```

These are business decisions and may improve later.

Document accepted targets.

---

## 21. Disaster Recovery Runbook

Include:

```text
Identify incident
Freeze unsafe writes if needed
Assess database
Assess storage
Restore database
Restore storage
Verify auth
Verify billing state
Verify recent transactions
Run integrity checks
Re-enable system
Communicate status
```

---

## 22. Maintenance Mode

Feature flag:

```text
maintenance_mode
```

When enabled:

- Public informational site may remain available
- Sensitive writes disabled
- Clear maintenance message shown

Admin access may remain available.

---

## 23. Read-Only Mode

Useful incident control:

```text
financial_writes_enabled = false
```

Allows users to view records but prevents new financial writes during integrity incidents.

---

## 24. Error Monitoring

Use production error monitoring platform if available.

Capture:

- Server exceptions
- Client exceptions
- API failures
- Failed jobs
- Provider integration failures

Do not attach raw sensitive finance payloads.

---

## 25. Structured Logging

Use structured logs.

Fields:

```text
timestamp
level
request_id
user_id hashed/opaque where appropriate
route
operation
status
duration_ms
error_code
release
```

Avoid logging full financial content.

---

## 26. Request IDs

Generate/request correlation ID.

Use across:

```text
web request
service
provider call
job
error log
```

This improves debugging without exposing user content.

---

## 27. Log Redaction

Redact:

- Passwords
- Tokens
- Cookies
- Authorization headers
- Account numbers
- OCR text
- Transaction notes where unnecessary
- Billing secrets
- Webhook signatures

---

## 28. Log Retention

Define retention.

Do not keep sensitive operational logs forever.

Separate:

```text
application logs
audit logs
billing events
job logs
```

---

## 29. Health Checks

Provide safe endpoints or internal functions for:

```text
app
database
storage
OCR
AI
billing
push
scheduler
```

Public health endpoint should reveal minimal details.

Admin health UI may show more safe diagnostics.

---

## 30. Liveness vs Readiness

Where useful:

```text
liveness = process is running
readiness = critical dependencies available
```

Do not mark app healthy solely because HTTP process responds.

---

## 31. Database Health

Use lightweight query.

Avoid expensive full-table checks.

---

## 32. Provider Health

Avoid costly provider calls on every health check.

Use:

- recent success metrics
- lightweight provider endpoint where available
- cached health state

---

## 33. Performance Monitoring

Track:

- Page response time
- API latency
- Database query latency
- OCR duration
- AI latency
- Billing webhook latency
- Scheduler duration
- Upload processing time

---

## 34. Slow Query Review

Identify slow database queries.

Review indexes based on real workload.

Do not blindly add indexes.

---

## 35. N+1 Review

Audit:

- Dashboard
- Analytics
- Admin
- Documents
- AI queries

for N+1 patterns.

---

## 36. Database Connection Strategy

Use Supabase-recommended connection mode for deployment environment.

Avoid exhausting PostgreSQL connection limits.

---

## 37. Payload Limits

Set limits for:

```text
JSON request size
image upload
PDF upload
AI question length
contact form
```

Reject oversized input early.

---

## 38. Rate Limiting

**Partial gate item** — authentication endpoints are rate limited before
launch. This section extends coverage to the rest.

Apply rate limits to:

```text
login-sensitive endpoints
registration
password reset
OCR
AI
contact form
billing checkout
scheduler endpoints
webhook endpoints where appropriate
```

Webhook endpoints should prioritize signature verification and provider behavior.

---

## 39. User-Level Rate Limits

Examples:

```text
OCR starts
AI queries
document uploads
login attempts
```

Separate technical rate limits from plan quotas.

---

## 40. IP-Level Protection

Use carefully for:

```text
authentication abuse
contact spam
bot traffic
```

Do not rely only on IP due shared networks/mobile users.

---

## 41. Cloudflare

Review:

- DNS
- TLS
- WAF options
- Bot protection
- Rate limiting if available
- Caching rules
- Page rules/configuration

Do not cache authenticated financial responses publicly.

---

## 42. Cache Rules

Public content may be cached.

Authenticated/private routes:

```text
no public shared cache
```

Sensitive APIs should use appropriate cache headers.

---

## 43. Security Headers

Review:

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Permissions-Policy
Strict-Transport-Security
```

Use modern equivalents rather than obsolete headers where appropriate.

---

## 44. Content Security Policy

CSP must account for:

- Supabase
- OAuth
- AdSense
- Analytics
- Billing provider
- OCR/AI server-side calls
- Web push

Keep policy as narrow as practical.

---

## 45. HTTPS

Production must use HTTPS.

No financial/auth page should be accessible over plain HTTP.

Redirect HTTP to HTTPS.

---

## 46. Cookie Security

Auth/session cookies should use:

- Secure
- HttpOnly where applicable
- SameSite appropriate to auth/OAuth flow

Follow Supabase/Next.js recommended patterns.

---

## 47. CSRF Protection

Ensure mutation patterns are CSRF-safe.

Especially:

```text
billing
admin actions
financial changes
account deletion
```

Use framework/server-action protections and same-site cookies appropriately.

---

## 48. XSS Protection

Escape/sanitize:

- User notes
- Merchant names
- Article HTML
- Admin support notes
- Filenames

Avoid unsafe HTML rendering.

---

## 49. SQL Injection

All queries parameterized.

Never interpolate:

- AI output
- Search text
- User input

into raw SQL.

---

## 50. SSRF Review

If any feature fetches remote URLs later, restrict it.

Current document upload should use files rather than arbitrary URL fetch where possible.

---

## 51. File Upload Security Review

Confirm:

- MIME validation
- Size limit
- Dimension limit
- Private bucket
- Random object paths
- No executable serving
- Metadata stripping
- Signed URLs
- Ownership checks

---

## 52. PDF Security

Treat PDFs as untrusted.

Do not execute embedded scripts.

Render/parse using safe libraries/providers.

Avoid exposing raw PDFs publicly.

---

## 53. OCR Provider Security

Document:

- Provider
- Data sent
- Retention behavior
- Region if relevant
- Authentication
- Timeout
- Retry

---

## 54. AI Provider Security

Document:

- Data minimization
- Provider
- Retention/training controls if configurable
- No unrestricted DB access
- Prompt-injection protections

---

## 55. Billing Webhook Security Review

Confirm:

- HTTPS
- Signature verification
- Idempotency
- Event replay protection
- Safe logging
- Correct environment

---

## 56. OAuth Review

Confirm:

- Approved callback URLs
- Production domain
- No wildcard callbacks if avoidable
- Correct Google OAuth consent/configuration
- Account linking behavior tested

---

## 57. Password Recovery Review

Test:

- Expired reset link
- Reused reset link
- Wrong account
- Suspended user
- Production callback domain

---

## 58. Session Security

Review:

- Session persistence
- Logout
- Session refresh
- Suspended-user enforcement
- Role changes reflected promptly

---

## 59. Admin Security

Strongly recommend:

- Separate admin route
- `requireAdmin`
- Re-authentication for critical operations where practical
- MFA if supported

Admin compromise has high impact.

---

## 60. Dependency Security

Regularly review:

```text
npm audit
dependency updates
known vulnerabilities
```

Do not blindly upgrade major versions in production.

Test first.

---

## 61. Lockfile

Commit package lockfile.

Use reproducible installs.

---

## 62. Node Version

Re-verify `PLATFORM-HELLODEPLOY.md` in full before launch. Rows can regress
silently when the platform upgrades its runtime — a Node bump that breaks
Sharp's prebuilt binaries surfaces as failed uploads, not as a build error.

Pin/document Node.js version compatible with:

- Next.js
- Sharp
- HelloDeploy

Avoid accidental production version drift.

---

## 63. Build Reproducibility

Use:

```text
npm ci
```

where appropriate for deployment.

Document production build command.

---

## 64. Data Integrity Checks

Create admin/maintenance functions to verify:

```text
account cached balance vs derived balance
   (derived per the PHASE-02 §34 balance-effect matrix,
    excluding accounts.opening_balance)
bill paid totals
receivable collected totals
expected-income applied totals
document link validity
subscription state consistency
```

---

## 65. Financial Integrity Job

Optional scheduled job:

```text
financial_integrity_check
```

It should report mismatches.

Do not silently modify data without controlled repair.

---

## 66. Repair Tools

Admin repair action should:

- Be narrow
- Be deterministic
- Require reason
- Audit changes

Avoid generic database-edit UI.

---

## 67. Data Export

**Gate item** — working before launch. This section extends format coverage
and adds document bundling.

Suggested:

```text
/settings/data
```

Exports may include:

- Accounts
- Transactions
- Bills
- Receivables
- Expected income
- Categories
- Document metadata

Documents may be downloadable separately.

---

## 68. Export Format

Start with:

```text
CSV
JSON
```

Optional ZIP bundle later.

Premium entitlements may control convenience exports, but privacy/data portability needs should remain considered.

---

## 69. Account Deletion

**Gate item** — a working deletion path exists before launch, because
Phase 10's privacy policy describes one.

Phase 14 hardens it: the grace period, the anonymisation policy, the
documented retention exceptions, and the confirmation that every table added
since has been folded into the cascade.

Workflow:

```text
Request Account Deletion
↓
Re-authenticate
↓
Explain consequences
↓
Confirm
↓
Optional grace period
↓
Delete/anonymize data
↓
Remove storage objects
↓
Disable auth account
```

---

## 70. Account Deletion Safety

Require:

- Recent authentication
- Explicit confirmation
- No one-click accidental deletion

Billing subscription should be cancelled/handled first.

---

## 71. Deletion Scope

Include:

- Profiles
- Accounts
- Transactions
- Bills
- Receivables
- Expected income
- Documents
- Storage files
- OCR results
- AI conversations
- Notifications
- Usage data as policy allows

Some operational/legal records may need limited retention.

Document exceptions.

---

## 72. Deletion Audit

Preserve minimal compliant operational record if needed.

Do not retain full financial data merely for convenience.

---

## 73. Data Retention Policy

Define actual retention for:

- Documents
- OCR raw text
- AI conversations
- Notifications
- Logs
- Audit records
- Billing records
- Deleted accounts

Policy must match Privacy page.

---

## 74. Retention Enforcement

Create scheduled cleanup jobs.

Examples:

```text
expired_notifications_cleanup
ocr_retention_cleanup
document_retention_cleanup
inactive_push_subscription_cleanup
```

Use safe dry-run/testing first.

---

## 75. Soft Delete vs Hard Delete

Financial in-app history:

```text
void/archive
```

Account deletion/privacy request:

```text
actual deletion/anonymization
```

These are different concepts.

---

## 76. Audit Log Retention

Audit logs are important but may contain sensitive metadata.

Set retention appropriate to operational/legal needs.

---

## 77. Billing Record Retention

Payment records may require longer retention for accounting/legal reasons.

Do not delete blindly with other app data.

Document jurisdiction/business requirements before launch.

---

## 78. Privacy Review

Before launch, verify Privacy Policy matches:

- Actual processors
- Actual data fields
- Actual retention
- Actual ads
- Actual analytics
- Actual billing
- Actual OCR/AI

---

## 79. Terms Review

Verify Terms match:

- Paid subscription behavior
- Cancellation
- OCR limitations
- AI limitations
- Service availability
- User responsibilities

---

## 80. Incident Response

Create basic incident severity model.

Example:

```text
SEV1
Major security/data-integrity incident

SEV2
Major outage

SEV3
Degraded provider/feature

SEV4
Minor defect
```

---

## 81. Incident Runbook

For serious incident:

```text
Detect
Assess
Contain
Disable affected feature
Preserve evidence/logs
Repair
Verify
Restore
Communicate
Review
```

---

## 82. Data Breach Response

Prepare process for:

- Determine affected users
- Determine affected data
- Revoke secrets
- Suspend compromised integrations
- Preserve logs
- Follow applicable legal notification requirements

Obtain proper legal guidance for actual obligations.

---

## 83. Provider Outage Runbooks

Document response for:

```text
Supabase outage
OCR outage
AI outage
Billing outage
Push outage
Cloudflare issue
HelloDeploy/server outage
```

---

## 84. Graceful Degradation

Examples:

OCR down:

```text
Manual finance tracking still works
```

AI down:

```text
Dashboard/analytics still work
```

Billing down:

```text
Existing entitlements continue based on safe cached state
New checkout disabled
```

Push down:

```text
In-app reminders still exist
```

---

## 85. Feature Kill Switches

Ensure every kill switch works, and that each has been exercised at least
once outside an incident:

```text
ocr_enabled
ai_enabled
billing_enabled
push_enabled
ads_enabled_global
financial_writes_enabled
maintenance_mode
```

---

## 86. Monitoring Alerts

Configure alerts for:

- High 5xx rate
- Database unavailable
- Scheduler missed
- Billing webhook failures
- OCR failure spike
- AI failure spike
- Storage upload failures
- Authentication failure spike

---

## 87. Alert Noise

Avoid alerts for every single user error.

Alert on operational patterns.

---

## 88. Uptime Monitoring

External uptime monitoring should check:

- Public home
- Login page
- Safe health endpoint

Authenticated flows require separate synthetic testing if desired.

---

## 89. Synthetic Smoke Tests

Automate or document:

```text
register/login test account
dashboard load
create test transaction in staging
document upload in staging
OCR staging
billing sandbox
```

Do not create fake production financial data unnecessarily.

---

## 90. Production Smoke Test

After deployment, check:

- Home
- Login
- Auth callback
- Dashboard
- Read-only DB query
- Storage signed URL
- Admin health

Avoid making destructive test transactions in production.

---

## 91. Browser Testing

Minimum:

```text
Chrome
Edge
Firefox
Safari where practical
Android Chrome
iOS Safari where practical
```

PWA/push support may differ.

---

## 92. Mobile Testing

Test:

- Small Android viewport
- Camera upload
- Touch targets
- PWA install
- Dark mode
- OCR review
- Dashboard
- Notifications

---

## 93. Accessibility Review

Before launch:

- Keyboard navigation
- Focus states
- Labels
- Contrast
- Error messages
- Dialogs
- Tables
- Charts
- Screen reader basics

---

## 94. Performance Review

Public pages:

- Core Web Vitals
- Image optimization
- Script weight

App pages:

- Dashboard query speed
- Transaction list
- Document list
- Analytics
- Admin

---

## 95. Large Data Testing

Test realistic heavy user:

```text
5,000+ transactions
500+ documents
hundreds of bills
multiple years of data
```

Ensure pages remain usable.

---

## 96. Pagination Review

Ensure large lists paginate:

- Transactions
- Documents
- Notifications
- Admin users
- Audit logs
- OCR jobs

---

## 97. Storage Growth Review

Estimate:

```text
average display WebP
average thumbnail
documents/user/month
retention
```

Use this to refine Premium pricing.

---

## 98. OCR Cost Review

Measure:

```text
cost/job
jobs/user/month
failure rate
retry rate
```

Use real data to adjust limits.

---

## 99. AI Cost Review

Measure:

```text
cost/query
input/output usage
average latency
queries/user/month
```

Use before final pricing.

---

## 100. Billing Economics Review

Before public Premium launch:

Compare:

```text
subscription price
payment fees
OCR cost
AI cost
storage
hosting
tax/business overhead
```

Avoid pricing that loses money at normal usage.

---

## 101. Ad Performance Review

For Free tier:

Track safely:

- Page RPM where available
- Public page traffic
- Ad layout impact

Do not optimize ads at the expense of app trust.

---

## 102. Launch Feature Flags

Before launch, explicitly decide state:

```text
ocr_enabled
ai_enabled
billing_enabled
push_enabled
ads_enabled_global
premium_enabled
```

Do not accidentally launch unfinished features.

---

## 103. Staging Acceptance

All critical production flows should pass staging first:

- Auth
- Financial writes
- Bills
- Documents
- OCR
- Forecast
- Notifications
- Billing sandbox
- AI
- Admin
- Account deletion

---

## 104. Production Readiness Checklist

### Infrastructure

- [ ] Production domain active
- [ ] HTTPS active
- [ ] Cloudflare configured
- [ ] HelloDeploy stable
- [ ] Node version pinned
- [ ] Environment variables complete
- [ ] No test secrets in production

### Database

- [ ] Migrations current
- [ ] RLS enabled, browser role holds SELECT only on user-owned tables
- [ ] `DATA-MODEL.md` matches the deployed schema
- [ ] Backup confirmed (gate)
- [ ] Restore procedure documented **and tested** (gate)
- [ ] Integrity checks pass
- [ ] No direct client write succeeds against any financial table

### Auth

- [ ] Email login works
- [ ] Google OAuth works
- [ ] Password reset works
- [ ] Account status enforcement works
- [ ] Admin RBAC works

### Financial Core

- [ ] Income works
- [ ] Expense works
- [ ] Transfer works
- [ ] Refund works
- [ ] Adjustment works
- [ ] Balances reconcile

### Obligations

- [ ] Bills work
- [ ] Receivables work
- [ ] Expected income works
- [ ] Partial payments work

### Documents

- [ ] Upload works
- [ ] WebP works
- [ ] Signed URLs work
- [ ] Storage private
- [ ] No cross-user access

### OCR

- [ ] OCR works
- [ ] Review required
- [ ] Duplicate protection works
- [ ] Provider privacy documented

### Analytics

- [ ] Dashboard totals correct
- [ ] Currency separation correct
- [ ] Performance acceptable

### Forecasting

- [ ] Recurring rules work
- [ ] Forecast correct
- [ ] Duplicate generation prevented

### Notifications

- [ ] In-app works
- [ ] Push works where supported
- [ ] Scheduler works
- [ ] Deduplication works

### Monetization

- [ ] Entitlements correct
- [ ] Free limits correct
- [ ] Premium limits correct
- [ ] Ads suppressed for Premium

### Public Site

- [ ] Privacy published
- [ ] Terms published
- [ ] Contact works
- [ ] Sitemap works
- [ ] robots.txt works
- [ ] SEO metadata correct

### Billing

- [ ] Production provider configured
- [ ] Webhook signature verified
- [ ] Idempotency tested
- [ ] Cancellation tested
- [ ] Grace policy tested
- [ ] Reconciliation works

### AI

- [ ] Approved-query model enforced
- [ ] No arbitrary SQL
- [ ] Usage limits work
- [ ] Provider failure fallback works
- [ ] Prompt injection tests pass

### Admin

- [ ] User management works
- [ ] System health works
- [ ] Job monitoring works
- [ ] Admin privacy boundaries reviewed

### Security

- [ ] Secrets reviewed
- [ ] Security headers deployed
- [ ] Rate limiting enabled
- [ ] File validation tested
- [ ] Webhooks secured
- [ ] Admin authorization tested
- [ ] Cross-user access tests pass

### Recovery

- [ ] Backup exists
- [ ] Restore test completed
- [ ] Incident runbook exists
- [ ] Maintenance mode works
- [ ] Read-only mode works

### Privacy

- [ ] Data export works (gate)
- [ ] Account deletion works (gate)
- [ ] Deletion cascade covers every table added since the gate
- [ ] Retention rules documented and enforced
- [ ] Privacy policy matches system

---

## 105. Launch Gate

Do not publicly launch if any critical issue exists in:

- Cross-user privacy
- Financial balance integrity
- Billing activation
- Authentication
- Backup/recovery
- Data deletion
- Secret exposure
- Admin authorization

Non-critical cosmetic issues may be handled after launch.

---

## 106. Acceptance Criteria

Phase 14 is complete only when:

1. Development, staging, and production are clearly separated.
2. Production secrets are managed securely.
3. All schema changes are migration-driven.
4. Production backups are confirmed (verified at the pre-launch gate).
5. Restore procedure has been tested, and testing is now routine.
6. Database and storage recovery are documented.
7. Deployment and rollback procedures exist.
8. Error monitoring is active.
9. Structured logging with redaction is implemented.
10. Safe health checks exist.
11. Rate limiting is enabled where needed.
12. Security headers are reviewed.
13. Private routes are not publicly cached.
14. File-upload security has been reviewed.
15. OAuth callbacks are locked to intended environments.
16. Billing webhooks are verified and idempotent.
17. Financial integrity checks exist.
18. Account deletion is implemented safely.
19. Data export exists.
20. Data-retention policy is documented and enforced where applicable.
21. Incident-response runbooks exist.
22. Provider-outage degradation behavior is documented.
23. Feature kill switches work.
24. Production smoke tests exist.
25. Cross-user privacy tests pass.
26. Large-data performance is acceptable.
27. Production-readiness checklist passes.
28. Critical launch blockers are resolved before public launch.

---

## 107. Definition of Done

Phase 14 is considered done when:

```text
HelloPera is not only feature-complete,
but production-ready:
secure,
recoverable,
observable,
privacy-conscious,
performance-tested,
and operationally prepared for real users.
```

At this point, the planned HelloPera implementation roadmap from Phase 00 through Phase 14 is complete.

Future work should be driven by:

```text
real user feedback
usage data
cost data
security findings
business priorities
```

rather than adding complexity without evidence.
