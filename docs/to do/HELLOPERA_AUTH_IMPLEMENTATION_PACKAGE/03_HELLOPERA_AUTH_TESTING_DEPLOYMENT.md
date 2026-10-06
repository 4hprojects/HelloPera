# HelloPera Authentication Testing and Deployment Plan

## Scope

Validate:

- Cloudflare Turnstile
- Supabase CAPTCHA protection
- Google OAuth
- email/password authentication
- registration
- password recovery
- PWA authentication behavior

Production URL:

```text
https://hellopera.online
```

## 1. Pre-Deployment Checks

Before deployment:

- install dependencies
- run lint
- run type checks if applicable
- run tests
- run production build
- inspect build warnings
- verify environment variables
- verify no private secrets are bundled

Expected public variable for Vite:

```text
VITE_TURNSTILE_SITE_KEY
```

## 2. Login Testing

### Valid Login

Test correct email/password with successful Turnstile verification.

Confirm:

- login succeeds
- redirect is correct
- Supabase session exists

### Invalid Password

Confirm:

- login denied
- sanitized error displayed
- form remains usable
- Turnstile resets if required

### Missing CAPTCHA

Attempt submission before verification.

Expected:

```text
Please complete the security verification.
```

No auth request should proceed.

### Expired CAPTCHA

Confirm:

- old token clears
- submission is blocked
- user can verify again

### Duplicate Click

Rapidly click sign in.

Confirm only one active auth request.

## 3. Registration Testing

Test:

- valid signup
- existing email
- weak password
- invalid email
- missing CAPTCHA
- failed CAPTCHA
- expired CAPTCHA
- network interruption

Confirm profile creation, metadata, onboarding, and confirmation flow remain intact.

## 4. Password Recovery Testing

Test:

- existing email
- unknown email
- missing CAPTCHA
- expired CAPTCHA
- failed CAPTCHA
- successful reset request
- password reset callback

Preferred success message:

```text
If an account exists for that email address, password recovery instructions will be sent.
```

## 5. Google OAuth Testing

### New Google User

1. complete Turnstile
2. click Continue with Google
3. authenticate with Google
4. return through Supabase callback
5. arrive at HelloPera
6. verify Supabase session
7. verify profile/onboarding behavior

### Returning Google User

Confirm no duplicate user/profile is created.

### OAuth Cancel

Cancel Google's flow.

Confirm the app remains usable and no broken auth state remains.

### OAuth Error

Confirm sanitized error and retry capability.

## 6. Session Testing

Test:

- refresh while authenticated
- browser restart
- installed PWA reopen
- logout
- protected route after logout
- expired Supabase session
- auth state restoration

## 7. Mobile Testing

Test:

```text
320px
375px
390px
430px
```

Confirm widget fit, form fit, keyboard behavior, validation visibility, and button reachability.

## 8. Desktop Testing

Test:

```text
768px
1024px
1440px
```

Confirm widget alignment, loading state, and callback navigation.

## 9. PWA Testing

Test:

- login
- logout
- registration
- Google OAuth
- OAuth return
- password recovery
- app resume
- service-worker update

Confirm Cloudflare challenge resources are not broken by caching.

## 10. Browser Console Review

Check for:

```text
Turnstile errors
CSP errors
Supabase Auth errors
OAuth redirect errors
service worker errors
mixed-content errors
JavaScript exceptions
```

Do not release with unresolved auth-related errors.

## 11. Network Review

Confirm:

- HTTPS only
- no secret query parameters
- no Turnstile secret
- no Google client secret
- no service-role key

## 12. Bundle Inspection

Search production build output for:

```text
TURNSTILE_SECRET_KEY
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_CLIENT_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

Expected:

```text
No matches
```

## 13. Production Deployment Verification

Open:

```text
https://hellopera.online
```

Verify:

- auth page loads
- Turnstile loads
- no hostname error
- email login works
- registration works
- Google login works
- password recovery works
- callback returns correctly
- dashboard loads
- protected routes remain protected

## 14. Cloudflare Production Check

Confirm:

- widget recognizes `hellopera.online`
- challenge succeeds
- Supabase accepts CAPTCHA-protected requests
- missing/invalid CAPTCHA is rejected as expected

## 15. Google Production Check

Confirm:

- OAuth client type is Web application
- JavaScript origin includes `https://hellopera.online`
- redirect URI exactly matches Supabase callback
- Supabase Google provider is enabled
- OAuth callback succeeds

## 16. Supabase Production Check

Confirm:

- CAPTCHA protection enabled
- Cloudflare Turnstile selected
- Turnstile secret configured
- Google provider enabled
- production Site URL correct
- redirect URLs correct
- RLS remains enabled

## 17. Failure Scenarios

Test or reason through:

- Turnstile unavailable
- Google unavailable
- Supabase unavailable
- offline PWA
- expired CAPTCHA
- expired session
- user closes OAuth flow
- user denies consent
- network drops during redirect

The UI should fail safely and allow retry where practical.

## 18. Release Checklist

- [ ] lint passes
- [ ] type check passes
- [ ] tests pass
- [ ] production build passes
- [ ] Turnstile site key configured
- [ ] no private secret exposed
- [ ] email login tested
- [ ] registration tested
- [ ] recovery tested
- [ ] Google OAuth tested
- [ ] callback tested
- [ ] mobile tested
- [ ] PWA tested
- [ ] route guards tested
- [ ] RLS behavior preserved
- [ ] browser console reviewed
- [ ] production network requests reviewed
- [ ] production deployment verified

## 19. Required Deployment Report

After deployment, report:

```text
Build:
Lint:
Type check:
Email login:
Registration:
Password recovery:
Google OAuth:
PWA login:
Turnstile secret exposed:
Google client secret exposed:
Service-role key exposed:
CAPTCHA token persistence found:
```

List any remaining real issues.
