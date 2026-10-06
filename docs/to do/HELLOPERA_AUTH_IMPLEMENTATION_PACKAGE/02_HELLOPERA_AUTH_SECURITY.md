# HelloPera Authentication Security and Environment Checklist

## Purpose

Use this checklist while implementing Cloudflare Turnstile and Google OAuth with Supabase Auth.

The dashboard setup is already complete.

## 1. Public Frontend Variables

The frontend may contain:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TURNSTILE_SITE_KEY=
```

Use the project's actual environment naming convention.

## 2. Private Values

Never expose these to browser code:

```text
TURNSTILE_SECRET_KEY
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

These must not use a frontend-public prefix such as:

```text
VITE_
NEXT_PUBLIC_
NUXT_PUBLIC_
PUBLIC_
```

## 3. Supabase-Owned Secrets

### Cloudflare Turnstile

The Turnstile secret should remain configured inside Supabase Authentication Attack Protection / CAPTCHA.

The frontend only needs the site key.

### Google OAuth

The Google OAuth client ID and secret should remain configured inside Supabase Authentication Sign In / Providers / Google.

The frontend should not need the Google client secret.

## 4. Existing `.env` Audit

If the project contains entries such as:

```env
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

inspect their usage before deleting anything.

Determine whether they are:

- used by backend-only code
- historical and unused
- accidentally exposed to frontend code
- committed to Git

For frontend Turnstile use in Vite, prefer:

```env
VITE_TURNSTILE_SITE_KEY=
```

## 5. Repository Secret Search

Search for:

```text
TURNSTILE_SECRET_KEY
TURNSTILE_SECRET
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
SUPABASE_SERVICE_ROLE_KEY
service_role
client_secret
```

Check source files, configs, scripts, logs, tests, examples, CI/CD, Docker files, and deployment scripts.

## 6. Git History

If a private secret has ever been committed:

1. report it
2. remove it from active code
3. rotate the credential
4. consider repository-history cleanup if required

Deleting the latest line alone does not invalidate an exposed secret.

## 7. `.env.example`

Example files should contain names only.

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_TURNSTILE_SITE_KEY=
```

Do not include production secret values.

## 8. Authentication Tokens

Do not log:

- passwords
- Turnstile CAPTCHA tokens
- Supabase access tokens
- Supabase refresh tokens
- Google OAuth access tokens
- Google authorization codes

Do not send them to analytics.

## 9. CAPTCHA Token Storage

Do not store CAPTCHA tokens in localStorage, sessionStorage, cookies, IndexedDB, Supabase, PostgreSQL, logs, or analytics.

Keep CAPTCHA tokens transient.

## 10. Turnstile Is Not Authentication

A successful challenge only means the request passed bot/human verification.

It does not prove identity, authorization, account ownership, or admin status.

## 11. Google OAuth Is Not Authorization

Google login establishes identity through Supabase.

Application permissions must still use user roles, server-side checks, and RLS policies.

## 12. Row Level Security

Confirm user-owned data remains protected through RLS.

Typical pattern:

```sql
auth.uid() = user_id
```

Do not weaken RLS as part of this implementation.

## 13. Service Role Key

The Supabase service-role key must never run in browser code.

If privileged functionality is required, keep it server-side.

## 14. Redirect Security

Use approved Supabase redirect URLs.

Avoid arbitrary user-controlled redirect destinations.

Prefer known routes such as:

```text
/auth/callback
/dashboard
```

## 15. CSP

If CSP exists:

- permit required Cloudflare Turnstile resources
- avoid wildcards
- preserve existing restrictions

Do not disable CSP to solve Turnstile errors.

## 16. PWA and Service Worker

Do not aggressively cache Cloudflare challenge resources.

Test fresh install, installed PWA, OAuth return, and service-worker updates.

## 17. HTTPS

Production auth must run over:

```text
https://hellopera.online
```

## 18. Production Verification

Before completion:

- inspect page source
- inspect network requests
- inspect built bundles
- search built assets for private secret names/values
- verify Turnstile loads
- verify Google OAuth completes
- verify Supabase session exists after callback

## 19. Security Completion Checklist

- [ ] Turnstile site key is public-only
- [ ] Turnstile secret remains private
- [ ] Google client secret remains private
- [ ] service-role key remains private
- [ ] no CAPTCHA token persistence
- [ ] no auth token logging
- [ ] route guards remain active
- [ ] RLS remains active
- [ ] OAuth redirect is restricted
- [ ] CSP remains restrictive
- [ ] PWA does not break Turnstile
- [ ] Git does not contain exposed secrets
- [ ] browser bundle does not contain private secrets
