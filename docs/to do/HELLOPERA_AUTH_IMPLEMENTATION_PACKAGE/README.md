# HelloPera Turnstile + Google Auth Implementation Package

This package contains the implementation documents for integrating Cloudflare Turnstile with the existing HelloPera Supabase authentication system while preserving Google OAuth.

## Files

1. `01_HELLOPERA_AUTH_IMPLEMENTATION.md`
   Primary implementation specification.

2. `02_HELLOPERA_AUTH_SECURITY.md`
   Secret handling, environment variables, RLS, OAuth, and security review.

3. `03_HELLOPERA_AUTH_TESTING_DEPLOYMENT.md`
   Testing, PWA checks, production verification, and release checklist.

## Current Dashboard Status

Already configured manually:

```text
Cloudflare Turnstile widget
Supabase CAPTCHA / Attack Protection
Google OAuth client
Supabase Google provider
```

The coding agent should not recreate these dashboard settings unless it finds a mismatch.

## Recommended Agent Prompt

```text
Read these files in order:

1. 01_HELLOPERA_AUTH_IMPLEMENTATION.md
2. 02_HELLOPERA_AUTH_SECURITY.md
3. 03_HELLOPERA_AUTH_TESTING_DEPLOYMENT.md

The Cloudflare Turnstile, Supabase CAPTCHA protection, and Google OAuth dashboard setup has already been completed.

Inspect the existing HelloPera codebase before making changes.

First identify:
- framework and build tool
- Supabase SDK version
- authentication components
- existing Google OAuth implementation
- email/password login
- registration
- password recovery
- route protection
- environment-variable conventions
- PWA/service-worker configuration
- CSP if present

Then implement the plan incrementally.

Preserve the current authentication architecture and UI where possible.

Do not expose:
- Turnstile secret
- Google OAuth client secret
- Supabase service-role key

After implementation:
- run lint
- run type checks if applicable
- run tests
- run production build
- inspect the bundle for secrets
- provide the required implementation report
```
