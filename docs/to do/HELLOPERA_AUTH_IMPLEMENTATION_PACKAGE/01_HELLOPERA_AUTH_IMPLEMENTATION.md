# HelloPera Authentication Implementation Plan

## Scope

Implement Cloudflare Turnstile bot protection with Supabase Auth and preserve the existing Google OAuth flow for HelloPera.

Production domain:

```text
https://hellopera.online
```

The following dashboard configuration has already been completed manually:

- Cloudflare Turnstile widget created
- Turnstile production hostname configured for `hellopera.online`
- Supabase CAPTCHA / Attack Protection enabled
- Cloudflare Turnstile selected as CAPTCHA provider in Supabase
- Turnstile secret configured in Supabase
- Google OAuth client created in Google Cloud
- Google OAuth client ID configured in Supabase
- Google OAuth client secret configured in Supabase
- Supabase authentication URL configuration completed or prepared for production

Do not recreate these dashboard settings unless a configuration mismatch is discovered during implementation.

## 1. Primary Goals

The implementation must:

- protect authentication actions from automated abuse
- preserve the existing Supabase Auth architecture
- preserve Google sign-in
- preserve email/password authentication if already implemented
- preserve registration and password recovery if already implemented
- work on mobile, desktop, and the installed PWA
- use Cloudflare Turnstile correctly
- never expose private secrets to frontend code
- keep the existing HelloPera UI unless a small auth-specific adjustment is required
- avoid unnecessary authentication rewrites

## 2. Required Initial Audit

Before modifying files, inspect the repository.

Identify:

- frontend framework
- build tool
- JavaScript or TypeScript usage
- Supabase SDK version
- Supabase client initialization
- login page
- registration page
- password recovery page
- Google OAuth logic
- route guards
- auth context/store/hooks
- toast/notification system
- PWA/service worker
- environment variable conventions
- CSP configuration if present
- current redirect/callback route

Before implementation, report the files that will likely be changed.

Do not assume file names.

## 3. Environment Variables

The browser only needs the Turnstile site key.

For Vite, use:

```env
VITE_TURNSTILE_SITE_KEY=
```

If the project uses another framework, use its existing public environment-variable convention.

Do not expose:

```text
TURNSTILE_SECRET_KEY
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

through a public frontend variable.

If private secrets currently exist in a local `.env`, inspect whether server-side code actually uses them before removing them.

For Supabase-managed Turnstile verification, the Turnstile secret normally remains only in Supabase.

For Supabase-managed Google OAuth, the Google OAuth client secret normally remains only in Supabase.

## 4. Turnstile Component

Create or reuse one reusable Turnstile component.

Possible location:

```text
src/components/auth/TurnstileWidget.tsx
```

Adapt to the existing structure.

The component must support:

- loading
- ready
- verified
- expired
- error
- reset

It should expose the CAPTCHA token to the parent auth form.

Suggested state:

```ts
const [captchaToken, setCaptchaToken] = useState<string | null>(null)
```

On verification:

```ts
setCaptchaToken(token)
```

On expiration or widget error:

```ts
setCaptchaToken(null)
```

Do not persist CAPTCHA tokens in localStorage, sessionStorage, cookies, IndexedDB, database tables, or Supabase metadata.

## 5. Turnstile Script

Use Cloudflare's official Turnstile script:

```text
https://challenges.cloudflare.com/turnstile/v0/api.js
```

Prefer framework-native integration.

Avoid duplicate script loading.

If explicit rendering is more reliable for the existing framework, use explicit rendering.

## 6. Login Flow

Target behavior:

```text
Login page
    |
Turnstile verification
    |
Authentication method selected
    |
    +--> Email/password
    |
    +--> Google
    |
Supabase Auth
    |
Authenticated session
    |
HelloPera dashboard
```

Do not allow protected email/password submission without a valid CAPTCHA token.

Recommended message:

```text
Please complete the security verification.
```

## 7. Email/Password Sign-In

Locate the current `supabase.auth.signInWithPassword(...)` call.

Use the CAPTCHA token through the supported Supabase SDK options.

Target pattern:

```ts
const { data, error } = await supabase.auth.signInWithPassword({
  email,
  password,
  options: {
    captchaToken
  }
})
```

Confirm the exact API against the installed Supabase SDK before committing the change.

After a failed attempt:

- clear consumed/invalid CAPTCHA token
- reset Turnstile when appropriate
- allow the user to verify again
- prevent duplicate submission

## 8. Registration

Locate `supabase.auth.signUp(...)`.

Pass the CAPTCHA token through supported options.

Target pattern:

```ts
const { data, error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    captchaToken
  }
})
```

Preserve user metadata, profile creation, onboarding, redirects, referral logic, and current validation.

## 9. Password Recovery

Locate `supabase.auth.resetPasswordForEmail(...)`.

Use CAPTCHA protection if supported by the installed SDK/API.

Preserve the current password reset redirect.

Recommended success message:

```text
If an account exists for that email address, password recovery instructions will be sent.
```

## 10. Google OAuth

Preserve the existing Google OAuth flow.

Expected structure:

```text
Turnstile pre-check
    |
Continue with Google
    |
supabase.auth.signInWithOAuth()
    |
Google
    |
Supabase callback
    |
HelloPera
```

Do not assume `signInWithOAuth()` accepts `captchaToken`.

Before changing the OAuth call:

1. inspect the installed `@supabase/supabase-js` version
2. inspect SDK typings or official docs
3. confirm whether CAPTCHA is supported directly for OAuth

If supported, pass the CAPTCHA token using the documented API.

If not supported:

- keep Turnstile as a UI pre-verification gate
- do not invent unsupported parameters
- do not create a custom backend merely to force CAPTCHA into OAuth
- document the behavior in the implementation report

The existing Google OAuth callback flow must continue working.

## 11. Google OAuth Redirect

Use the project's actual callback route.

A typical call may resemble:

```ts
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})
```

Do not hardcode production URLs if the project already supports multiple environments.

## 12. Auth UI Behavior

Keep the current HelloPera design.

Suggested order:

```text
Email
Password

Security verification

Sign in

or

Continue with Google

Forgot password?
Create account
```

Do not redesign unrelated pages.

## 13. Loading and Duplicate Submission

During auth requests:

- disable the relevant button
- prevent double submission
- show the current loading UI
- keep state consistent
- reset CAPTCHA only when necessary

## 14. Error Handling

Handle:

```text
Turnstile load failure
Turnstile expiration
Turnstile rejection
Network failure
Supabase authentication failure
OAuth callback failure
```

Never expose secret values, raw tokens, or raw stack traces.

## 15. PWA Requirements

Verify authentication when:

- opened in a normal browser tab
- opened as installed PWA
- returning from Google OAuth
- resuming after app backgrounding
- refreshing protected routes

Review the service worker.

Do not cache Cloudflare challenge resources in a way that breaks Turnstile.

## 16. Content Security Policy

If the project uses CSP, inspect it before editing.

Permit only the Cloudflare Turnstile resources that are necessary.

Do not weaken CSP globally with wildcard rules.

## 17. Route Protection

Turnstile is bot protection, not authentication or authorization.

Protected routes must continue checking the Supabase session.

## 18. Database Security

Do not weaken RLS.

User-owned records should continue relying on Supabase Auth identity such as:

```sql
auth.uid()
```

## 19. Secret Audit

Search the repository for:

```text
TURNSTILE_SECRET_KEY
TURNSTILE_SECRET
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

Confirm they are not exposed in browser bundles, committed to Git, logged, or returned from APIs.

If a secret was previously committed, report it. Rotation may be required.

## 20. Local Development

Check whether the current Turnstile widget supports:

```text
localhost
127.0.0.1
```

If not, recommend a separate development widget.

Do not weaken production security for local testing.

## 21. Responsive Behavior

Test at:

```text
320px
375px
390px
430px
768px
1024px
1440px
```

The Turnstile widget must not overflow the auth card.

## 22. Accessibility

Preserve keyboard navigation, visible focus, logical form order, readable validation, and accessible button states.

## 23. Implementation Phases

### Phase 1: Audit
- inspect repository
- identify framework
- identify Supabase SDK
- identify auth files
- identify OAuth flow
- identify PWA configuration
- identify CSP
- identify environment conventions

### Phase 2: Environment
- add public Turnstile site key variable
- update `.env.example`
- verify `.gitignore`
- audit private secrets

### Phase 3: Turnstile Component
- create/reuse component
- implement callbacks
- implement reset
- implement expiry
- implement error handling

### Phase 4: Email Login
- add Turnstile
- require token
- pass token to Supabase
- reset correctly after failures

### Phase 5: Registration
- add Turnstile
- pass token
- preserve existing onboarding

### Phase 6: Password Recovery
- add Turnstile
- pass token where supported
- preserve reset URL

### Phase 7: Google OAuth
- preserve current flow
- inspect SDK support
- use CAPTCHA directly only if supported
- otherwise use Turnstile as a pre-auth gate

### Phase 8: PWA/CSP
- verify service worker
- verify installed PWA
- update CSP only if needed

### Phase 9: Security Review
- check secrets
- check token persistence
- check route guards
- check RLS assumptions

### Phase 10: Testing
- run build
- run lint
- run tests
- perform manual auth verification

## 24. Definition of Done

- [ ] Turnstile appears on relevant auth flows
- [ ] site key comes from environment configuration
- [ ] Turnstile secret is not exposed in frontend code
- [ ] Google OAuth secret is not exposed in frontend code
- [ ] email/password login works
- [ ] registration works
- [ ] password recovery works
- [ ] Google sign-in works
- [ ] failed CAPTCHA is handled
- [ ] expired CAPTCHA is handled
- [ ] CAPTCHA tokens are not persisted
- [ ] duplicate auth requests are prevented
- [ ] login UI remains responsive
- [ ] mobile auth works
- [ ] installed PWA auth works
- [ ] Google OAuth callback works
- [ ] protected routes remain protected
- [ ] Supabase session persistence still works
- [ ] RLS behavior is preserved
- [ ] production build succeeds
- [ ] lint passes
- [ ] relevant tests pass
- [ ] no secret is present in browser bundles

## 25. Required Agent Report

After implementation, provide:

- files changed
- auth flows updated
- Google OAuth CAPTCHA behavior
- environment variable names only
- security findings
- tests performed and results
- remaining manual actions

## 26. Coding Agent Instruction

Use this file as the implementation specification.

Before making changes:

1. inspect the repository
2. identify the current auth architecture
3. identify Supabase SDK version
4. identify existing Google OAuth implementation
5. identify files to change
6. reuse existing project patterns

Prefer the smallest secure implementation.

Do not rewrite working authentication without a demonstrated reason.
