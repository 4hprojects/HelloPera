# HelloPera — Phase 01: Authentication, Google OAuth, RBAC and Security

## 1. Objective

Build the complete authentication and authorization foundation for HelloPera.

At the end of this phase, HelloPera should support:

- Email and password registration
- Email and password login
- Google OAuth registration and login
- Email verification
- Password recovery
- Secure session persistence
- Logout
- User profiles
- Role-Based Access Control
- `user` and `admin` roles
- Protected application routes
- Protected admin routes
- Supabase Row Level Security
- User account status controls
- Basic admin shell
- Secure account deletion foundation
- Audit-friendly security behavior

This phase must be completed before any real financial data is introduced.

---

## 2. Dependencies

Phase 01 requires Phase 00 to be complete.

Required Phase 00 outputs:

- Next.js project running
- TypeScript configured
- Tailwind configured
- HelloPera Jade theme configured
- PWA shell available
- Supabase connection configured
- Environment variables validated
- HelloDeploy production build working
- Public, application, and admin route shells created

---

## 3. Scope

### Included

- Supabase Auth configuration
- Email/password registration
- Email/password login
- Google OAuth
- Email verification flow
- Password reset flow
- Logout
- Session persistence
- Auth callback route
- Profile creation
- Profile update basics
- User role model
- `user`
- `admin`
- User account status model
- Active/suspended/disabled handling
- Protected app routes
- Protected admin routes
- Server-side role validation
- Initial Row Level Security
- Secure admin promotion strategy
- Basic admin dashboard shell
- Auth error handling
- Account deletion request foundation
- Account identity/linking considerations
- Security audit logging foundation

### Out of Scope

Do not implement yet:

- Financial accounts
- Transactions
- Bills
- Receivables
- OCR
- Document uploads
- Premium subscriptions
- AdSense
- Billing
- AI assistant
- Full admin user management
- Full account deletion workflow
- Fine-grained permissions beyond current role needs

---

## 4. Authentication Providers

HelloPera should support:

```text
Email + Password
Google OAuth
```

Use Supabase Auth as the identity provider.

---

## 5. Authentication Architecture

```text
User
↓
Email/Password or Google OAuth
↓
Supabase Auth
↓
Authenticated Identity
↓
profiles table
↓
role + account status
↓
Route Authorization
↓
HelloPera Application
```

Admin path:

```text
Authenticated Identity
↓
profiles.role
↓
admin
↓
Admin Route Authorization
↓
/admin
```

---

## 6. Authentication Rules

### Default Role

Every newly created user must default to:

```text
user
```

Never assign:

```text
admin
```

from:

- Browser request
- Form field
- Google OAuth metadata
- Client-side state
- User-editable profile fields

Admin promotion must only happen through a trusted server-side or database-controlled process.

---

## 7. User Roles

Initial roles:

```text
user
admin
```

Possible future role:

```text
super_admin
```

Do not add `super_admin` in Phase 01 unless a concrete use case requires it.

---

## 8. User Account Status

Initial statuses:

```text
active
suspended
disabled
```

Recommended behavior:

### active

Normal access.

### suspended

User authentication may still exist, but HelloPera application access is blocked.

Use for temporary administrative suspension.

### disabled

Application access blocked.

May be used before account deletion or for permanent administrative disabling.

Do not physically delete the Supabase Auth identity simply to disable application access.

---

## 9. Database Changes

Create:

```text
profiles
```

Suggested schema:

```sql
profiles
--------
id uuid primary key
email text
full_name text
avatar_url text
role text
status text
timezone text          -- default 'Asia/Manila'
default_currency text  -- default 'PHP'
created_at timestamptz
updated_at timestamptz
```

### Why timezone and default_currency Belong Here

`Asia/Manila` is assumed as the user-facing timezone by Phases 02, 03, 06,
07, 08, 09 and 12 — for transaction dates, bill due-date comparison, monthly
analytics boundaries, forecast dates, usage periods and relative date parsing
in the assistant.

Putting the column on `profiles` now costs one line. Adding it later means a
migration plus an audit of every date comparison in seven phases.

Phase 01 does not need to expose a timezone picker. It needs the column to
exist with a sensible default, so later phases read one authoritative value
instead of hardcoding a string in seven places.

Recommended relationship:

```text
profiles.id
=
auth.users.id
```

### Suggested Constraints

```text
role:
user
admin

status:
active
suspended
disabled
```

Use database constraints or enums where practical.

---

## 10. Optional Role Design

For Phase 01, use:

```text
profiles.role
```

Do not yet create:

```text
roles
permissions
role_permissions
user_roles
```

unless product requirements expand.

The simpler role column is sufficient for:

```text
user
admin
```

Fine-grained permission tables may be introduced later.

---

## 11. Profile Creation

A profile should be created automatically after successful user registration.

Possible strategies:

```text
Database trigger
```

or:

```text
Trusted server-side profile creation
```

Preferred approach:

```text
Database trigger on auth.users
```

because it keeps profile creation consistent regardless of whether the user registers through:

- Email/password
- Google OAuth

The trigger should populate:

```text
id
email
full_name
avatar_url
role = user
status = active
```

where available.

---

## 12. Email and Password Registration

Required registration fields:

```text
Email
Password
Confirm Password
```

Optional:

```text
Full Name
```

Flow:

```text
Registration Form
↓
Validate
↓
Supabase Sign Up
↓
Email Verification Required
↓
Profile Created
↓
Verification Success
↓
Login / Dashboard
```

---

## 13. Password Requirements

Define password validation centrally.

Initial recommendation:

```text
Minimum 8 characters
```

Consider stronger rules later if needed.

Avoid overly complex rules that encourage predictable passwords.

Show:

- Password visibility toggle
- Clear validation errors
- Password confirmation mismatch
- Invalid/weak password response

---

## 14. Email Verification

Email registration should require verification before normal application access.

Possible flow:

```text
Register
↓
Verification email sent
↓
Check your inbox screen
↓
User clicks verification link
↓
Auth callback
↓
Profile confirmed
↓
Dashboard
```

Unverified users should not gain access to sensitive finance functionality.

---

## 15. Email Login

Login fields:

```text
Email
Password
```

Flow:

```text
Login
↓
Supabase Auth
↓
Check account status
↓
Check session
↓
Redirect to Dashboard
```

If user status is:

```text
suspended
disabled
```

redirect to an appropriate access-blocked page.

---

## 16. Google OAuth

Provide:

```text
Continue with Google
```

Flow:

```text
Continue with Google
↓
Google OAuth
↓
Supabase Auth
↓
OAuth Callback
↓
Profile Created/Loaded
↓
role = user
↓
status = active
↓
Dashboard
```

Google OAuth must never grant admin role.

---

## 17. Google OAuth Configuration

Required external setup:

- Google Cloud project
- OAuth consent screen
- OAuth client
- Authorized redirect URIs
- Supabase Google provider configuration

Expected callback pattern should use the Supabase/Next.js authentication flow selected during implementation.

Document all required callback URLs for:

```text
Local development
Staging
Production
```

---

## 18. OAuth Environment Handling

Do not expose private OAuth credentials directly to the client.

Google client configuration required by Supabase should be configured in trusted provider settings.

Environment-specific URLs must be documented.

---

## 19. Authentication Pages

Create:

```text
/login
/register
/forgot-password
/reset-password
/verify-email
/auth/callback
/account-suspended
/account-disabled
```

Optional:

```text
/auth/error
```

---

## 20. Route Groups

Suggested application organization:

```text
app/
├── (public)/
├── (auth)/
│   ├── login/
│   ├── register/
│   ├── forgot-password/
│   └── verify-email/
│
├── (app)/
│   └── dashboard/
│
├── admin/
│
└── auth/
    └── callback/
```

Exact grouping may vary based on current Next.js conventions.

---

## 21. Protected User Routes

The application area should require authentication.

Future protected user routes include:

```text
/dashboard
/transactions
/accounts
/bills
/receivables
/analytics
/documents
/settings
```

In Phase 01 only:

```text
/dashboard
/settings
```

need real authenticated behavior.

Other routes may remain future placeholders.

---

## 22. Protected Admin Routes

Admin routes must require:

```text
authenticated user
+
role = admin
+
status = active
```

Initial route:

```text
/admin
```

Future routes:

```text
/admin/users
/admin/subscriptions
/admin/usage
/admin/ocr-jobs
/admin/content
/admin/system
```

Do not rely on client-side route checks only.

---

## 23. Authorization Layers

Use all appropriate layers:

### UI Layer

Hide or disable actions the current user cannot access.

### Route Layer

Prevent unauthorized access.

### Server Layer

Validate role before executing privileged actions.

### Database Layer

Use RLS policies.

Rule:

```text
Frontend visibility is not security.
```

---

## 24. Row Level Security

RLS must be enabled on `profiles` and on every user-owned table added later.

Phase 01 establishes the write-path rule that all later phases inherit (see
master plan §33):

```text
Client RLS grants SELECT on own rows only.
All INSERT / UPDATE / DELETE go through server actions.
```

### Why Not Client Writes

With the Supabase anon key, the browser reaches PostgREST directly. RLS
cannot tell a call made by your service layer from a `fetch` typed into
devtools — there is no "came from my code" condition available to a policy.

So a rule like *"the user may update their allowed fields but not role or
status"* is only enforceable as column-level policy plus triggers, and every
new column becomes a new place to get it wrong. Routing writes through server
actions makes the safe case the default: a column the client never sends is a
column the client cannot set.

---

## 25. Profile Policies

### Read

```text
SELECT on profiles
where (select auth.uid()) = id
```

### Write

No `INSERT` / `UPDATE` / `DELETE` policy for the authenticated browser role.

Profile updates go through an `updateProfile` server action that:

1. Resolves the current user server-side — never trusting a submitted `id`.
2. Accepts only an explicit field allowlist: `full_name`, `avatar_url`,
   `timezone`, `default_currency`, theme preference.
3. Validates with Zod.
4. Writes with the service role.

`role` and `status` are not in the allowlist and have no code path that
accepts them from a request. They change only through the admin operations
described in §27.

Profile creation is handled by the database trigger in §11, not by a client
insert.

### Test It

The database security test cases in §51 must include an attempt to `UPDATE`
`profiles` directly with the anon key. It must fail at the database, not
merely be absent from the UI.

---

## 26. Admin Security Model

Admin access should be treated as operational privilege, not universal financial access.

Admin may access:

- User identity metadata needed for operations
- Account status
- Plan
- Subscription state
- Usage counts
- Failed background jobs
- Application health

Admin should not automatically access:

- Private receipt images
- Full transaction histories
- Personal financial notes
- Personal documents

Any future support-access workflow should require explicit design.

---

## 27. Admin Promotion

Approved approaches:

### Development

Use a trusted SQL migration or secure server operation.

### Production

Use a secure server-only role management path.

Never support:

```text
?role=admin
```

or any client-controlled equivalent.

Document the initial admin bootstrap procedure.

---

## 28. Initial Admin Bootstrap

Phase 01 should define how the first admin is created.

Recommended initial process:

1. Register normally.
2. Confirm email or Google login.
3. Obtain the user's UUID.
4. Promote role through trusted Supabase SQL/editor or migration.
5. Verify `/admin` access.
6. Confirm normal users cannot access `/admin`.

Do not hardcode personal email addresses in application source.

---

## 29. Session Management

Use Supabase-supported secure session management for Next.js.

Requirements:

- Server can resolve current user
- Session survives normal page navigation
- Session refresh works
- Logout clears session
- Protected routes correctly handle expired sessions

Avoid storing raw access tokens manually in localStorage when the official Supabase integration handles sessions more securely.

---

## 30. Middleware / Route Protection

Use the current recommended Next.js + Supabase method for:

- Session refresh
- Protected user routes
- Admin route protection

Do not duplicate authorization logic across many pages.

Centralize route rules where practical.

---

## 31. User Context

Create a clean server-side helper for obtaining:

```text
current user
profile
role
status
```

Example conceptual helper:

```text
getCurrentUser()
getCurrentProfile()
requireUser()
requireAdmin()
```

This avoids repeating auth logic throughout the application.

---

## 32. Client-Side Auth State

Client-side auth state may be used for interface behavior.

Do not rely on it for privileged operations.

Server must remain authoritative for:

```text
admin
account status
protected data access
```

---

## 33. Account Status Enforcement

Every protected request should ultimately respect:

```text
profiles.status
```

Behavior:

### active

Proceed.

### suspended

Block app access and show suspension screen.

### disabled

Block app access and show disabled-account screen.

Admin role should not bypass disabled status unless explicitly designed.

---

## 34. Profile Settings

Phase 01 basic settings may support:

```text
Full name
Avatar URL / Google avatar reference
Theme preference if already supported
```

Do not allow users to edit:

```text
role
status
email verification state
subscription plan
```

through generic profile forms.

---

## 35. Password Recovery

Create flow:

```text
Forgot Password
↓
Enter Email
↓
Supabase Reset Email
↓
Reset Link
↓
Set New Password
↓
Login
```

Handle:

- Expired reset link
- Invalid token
- Password mismatch
- Successful reset

---

## 36. Logout

Logout should:

- End Supabase session
- Clear relevant local UI state
- Redirect to login or public page

Do not retain private user state after logout.

---

## 37. Account Linking

HelloPera may encounter users who:

1. Registered with email/password.
2. Later choose Google using the same email.

Phase 01 should document the desired behavior.

Preferred outcome:

```text
One HelloPera user identity
```

rather than duplicate finance accounts.

Use supported Supabase identity linking behavior where appropriate.

Do not manually merge users without a verified safe process.

---

## 38. Account Deletion Foundation

Phase 01 exposes a future-safe design. The financial tables do not exist yet,
so the full cascade cannot be written here.

Prepare:

```text
Delete Account
```

under settings. In Phase 01 it may be labelled as coming soon.

### It Cannot Stay Deferred

Account deletion must be **complete and working before Phase 10 publishes the
public site**, because:

- Phase 10's privacy policy is required to describe deletion. Describing a
  capability that does not exist is not an option.
- Phase 11 takes payment. Holding financial documents and card-linked
  subscriptions without a working deletion path is not a defensible position.

It is listed in the pre-public-launch gate (master plan §54a) alongside a
tested backup restore and data export. Phase 14 still owns the hardening
detail — grace periods, anonymisation policy, retention exceptions — but a
working path must exist before launch, not after.

Each later phase that introduces user-owned data extends the deletion cascade
in the same commit as the table that needs it. This keeps the cascade current
instead of reconstructing it from ten phase documents at the end.

Deletion must eventually include:

- Supabase Auth user
- Profile
- Financial data
- Documents
- Storage objects
- Subscription state
- Audit handling where legally/operationally appropriate

---

## 39. Audit Logging Foundation

Create an authentication/security event logging strategy.

Possible events:

```text
user_registered
user_logged_in
user_logged_out
password_reset_requested
password_reset_completed
google_oauth_login
account_suspended
account_reactivated
role_changed
```

Avoid logging:

- Passwords
- Tokens
- OAuth secrets

A full audit log table may be created now or in Phase 02.

If created now, keep its purpose limited to authentication/security events.

---

## 40. Audit Table

If `audit_logs` is created in Phase 01, create it with the **full shape**
Phase 02 requires — not a reduced one:

```text
audit_logs

id
actor_user_id
target_user_id
entity_type
entity_id
event_type
before_data jsonb
after_data jsonb
metadata jsonb
created_at
```

Phase 01 populates only `actor_user_id`, `target_user_id`, `event_type`,
`metadata` and `created_at`, leaving the entity and diff columns null for
authentication events — they have no meaningful before/after state.

Creating the narrow shape here would mean an `ALTER` on Phase 02's first day,
for no benefit. The columns cost nothing while unused.

If implemented:

- User should not be able to rewrite audit history.
- No `INSERT` / `UPDATE` / `DELETE` policy for the browser role. Audit rows
  are written by services only.
- Users may read their own audit history if product design allows.
- Sensitive secrets must never be stored in metadata.

---

## 41. Error Handling

Authentication errors should be translated into user-friendly messages.

Examples:

```text
Invalid email or password
Email already registered
Please verify your email
Google sign-in failed
Your account is suspended
Your account is disabled
Session expired
Reset link is invalid or expired
```

Do not expose raw provider stack traces.

---

## 42. Security Error Logging

Server logs may contain:

- Error type
- Internal request identifier
- Timestamp
- User ID when safe

Do not log:

- Password
- Access token
- Refresh token
- OAuth secret

---

## 43. Rate Limiting

Phase 01 should define basic protection for high-risk routes.

Candidate endpoints:

```text
login
register
forgot password
auth callback abuse paths
```

Implementation may depend on HelloDeploy infrastructure.

At minimum, the architecture should be ready for rate limiting.

---

## 44. CSRF and Request Safety

Use framework and Supabase-recommended request handling.

Privileged server actions must validate:

- Authenticated user
- Authorization
- Request inputs

Do not trust hidden form fields for role or account status.

---

## 45. Validation

Use Zod for form input validation where appropriate.

Validate:

```text
email
password
confirm password
full name
callback parameters
profile updates
```

Validation should run:

```text
Client for UX
Server for authority
```

---

## 46. Auth UI Requirements

Use HelloPera Jade.

### Login

Include:

- HelloPera branding
- Email
- Password
- Sign in
- Continue with Google
- Forgot password
- Register link

### Register

Include:

- Full name
- Email
- Password
- Confirm password
- Create account
- Continue with Google
- Login link

### General

- Mobile-first
- Accessible labels
- Password visibility control
- Loading states
- Disabled submit state while processing
- Clear errors
- No layout shifts during auth operations

---

## 47. Google Button

Use recognizable Google sign-in wording:

```text
Continue with Google
```

Do not visually imply that Google is part of HelloPera.

Follow Google branding requirements where applicable.

---

## 48. Authenticated Application Shell

Once logged in, user should see:

```text
Dashboard
Settings
Logout
```

Future navigation items may remain visible as disabled placeholders only if useful.

Prefer not to clutter the MVP shell with non-functional links.

---

## 49. Admin Shell

Initial `/admin` should show:

```text
HelloPera Admin
```

Possible summary placeholders:

```text
Users
Subscriptions
OCR Jobs
System
```

Only admin users may access it.

Do not display real financial data.

---

## 50. Route Behavior

### Not Authenticated

Trying to access:

```text
/dashboard
```

should redirect to:

```text
/login
```

### Normal User

Trying to access:

```text
/admin
```

should return:

```text
403 / unauthorized
```

or redirect to a safe page.

### Suspended User

Trying to access protected app:

```text
/account-suspended
```

### Disabled User

Trying to access protected app:

```text
/account-disabled
```

---

## 51. Database Security Test Cases

Verify:

- User A cannot query User B profile.
- User A cannot update User B profile.
- User A cannot change own role to admin.
- User A cannot change own status.
- A direct `UPDATE` on `profiles` with the anon key fails at the database.
- A direct `INSERT` into `audit_logs` with the anon key fails at the database.
- Admin route rejects User A if role=user.
- Suspended user cannot access protected app.
- Disabled user cannot access protected app.

---

## 52. Suggested Services / Helpers

Possible structure:

```text
services/
  auth.service.ts

lib/
  auth/
    require-user.ts
    require-admin.ts
    current-profile.ts

lib/
  supabase/
    client.ts
    server.ts
```

Do not overabstract.

Keep auth logic centralized and readable.

---

## 53. Server Actions / API Responsibilities

Potential actions:

```text
registerWithEmail
loginWithEmail
loginWithGoogle
logout
requestPasswordReset
resetPassword
updateProfile
```

Admin operations such as role changes should not be exposed as generic client-callable functions.

---

## 54. Environment Variables

Phase 01 may require:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

Google provider credentials should remain configured through the trusted Supabase/provider setup.

Any server-only secret must remain server-only.

---

## 55. Redirect URLs

Document environment-specific redirect URLs.

Example categories:

```text
Local
Staging
Production
```

Ensure Google OAuth and Supabase redirect configuration match.

Incorrect redirect configuration is a common source of OAuth failure.

---

## 56. Email Templates

Customize Supabase Auth email templates where practical for:

```text
Email verification
Password reset
```

Brand them with:

```text
HelloPera
```

Avoid launching with generic placeholder application names.

---

## 57. Security Headers

Carry forward Phase 00 security headers.

Review:

- Content Security Policy where practical
- Frame restrictions
- Referrer policy
- HTTPS behavior

OAuth and Supabase endpoints must remain compatible with the chosen policy.

---

## 58. Privacy Considerations

At registration, HelloPera should not request financial information.

Collect only necessary identity data.

Do not request:

- Bank account credentials
- E-wallet passwords
- Government IDs

unless a future feature has a justified need.

---

## 59. Testing Checklist

### Email Registration

- [ ] Valid registration succeeds
- [ ] Invalid email rejected
- [ ] Password validation works
- [ ] Password confirmation works
- [ ] Existing email handled
- [ ] Verification email sent
- [ ] New profile created
- [ ] New user role is `user`
- [ ] New user status is `active`

### Email Verification

- [ ] Verification link works
- [ ] Invalid verification link handled
- [ ] Verified user can access dashboard
- [ ] Unverified user cannot access sensitive app

### Email Login

- [ ] Valid credentials work
- [ ] Invalid credentials handled
- [ ] Session persists
- [ ] Expired session redirects correctly

### Google OAuth

- [ ] Google sign-in starts
- [ ] OAuth callback works
- [ ] Profile created
- [ ] Role defaults to `user`
- [ ] Status defaults to `active`
- [ ] Existing identity behavior is tested
- [ ] Cancelled OAuth handled

### Password Recovery

- [ ] Reset email sends
- [ ] Reset link works
- [ ] Expired link handled
- [ ] New password works

### Logout

- [ ] Session ends
- [ ] Protected routes no longer accessible
- [ ] Sensitive state is cleared

### RBAC

- [ ] Normal user can access dashboard
- [ ] Normal user cannot access admin
- [ ] Admin can access admin
- [ ] Admin access validated server-side
- [ ] Client cannot self-promote role

### Status

- [ ] Active user works normally
- [ ] Suspended user blocked
- [ ] Disabled user blocked
- [ ] Status cannot be modified by regular user

### RLS

- [ ] User reads own profile
- [ ] User cannot read another profile
- [ ] User updates only allowed own fields
- [ ] User cannot update role
- [ ] User cannot update status

### Production

- [ ] Auth works through HelloDeploy
- [ ] Google OAuth production callback works
- [ ] Verification links use production URL
- [ ] Password reset links use production URL
- [ ] HTTPS works
- [ ] No tokens leaked to logs
- [ ] No secrets exposed in client bundle

---

## 60. Deployment Checks

Before marking Phase 01 complete:

- [ ] Supabase Auth production URL configured
- [ ] Google provider enabled
- [ ] Google callback URLs configured
- [ ] Supabase redirect URLs configured
- [ ] Production environment variables configured
- [ ] `DATA-MODEL.md` updated in the same commit as the migration
- [ ] Profile trigger deployed
- [ ] RLS enabled
- [ ] RLS policies deployed
- [ ] First admin bootstrap documented
- [ ] Production login tested
- [ ] Production Google OAuth tested
- [ ] Suspended account tested
- [ ] Admin access tested

---

## 61. Acceptance Criteria

Phase 01 is complete only when all of the following are true:

1. Users can register with email and password.
2. Users can log in with email and password.
3. Users can continue with Google.
4. Email verification works.
5. Password recovery works.
6. Sessions persist securely.
7. Logout works.
8. Every authenticated user has a profile.
9. New users default to `role = user`.
10. New users default to `status = active`.
11. Regular users cannot promote themselves.
12. User routes require authentication.
13. Admin routes require `role = admin`.
14. Suspended users are blocked.
15. Disabled users are blocked.
16. RLS protects profile ownership, granting the browser SELECT only.
17. All profile mutations go through server actions with a field allowlist.
18. Direct client writes to `profiles` are rejected by the database.
19. `profiles` carries `timezone` and `default_currency` with sane defaults.
20. Users cannot edit role or status directly.
21. Google OAuth works in production through HelloDeploy.
22. No authentication secret is exposed to the client.
23. First-admin bootstrap procedure is documented.

---

## 62. Definition of Done

Phase 01 is considered done when:

```text
HelloPera has a secure identity layer
with email authentication,
Google OAuth,
session handling,
profile creation,
RBAC,
account status controls,
protected user routes,
protected admin routes,
and Supabase RLS.
```

The application should then be ready to begin:

```text
Phase 02 — Financial Core
```

Do not proceed to Phase 02 until all Phase 01 acceptance criteria pass.
