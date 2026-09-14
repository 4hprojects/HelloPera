# Content Security Policy — status and the header to ship

CSP has been deferred three times: Phase 00 §26 deferred it to Phase 01, which
did not add it, and Phase 10 inherits it. This note records why it is still
deferred, and what to ship when it lands, so the next person does not have to
rediscover the origins.

## Why it is not on yet

A CSP that is wrong is worse than absent: it breaks the page silently in
browsers the developer is not using, and the failure looks like an unrelated
bug. Getting it right needs the full set of origins, and two of them are not
settled yet:

- **AdSense** is not configured, so its origins cannot be verified against a
  real ad serving.
- **The domain** does not resolve yet, so nothing has run behind the real
  Supabase and OAuth origins in production.

Both are on the launch checklist. CSP should land with them, before the public
site is announced — not after.

## What HelloPera actually loads

| Origin | Why |
|---|---|
| `'self'` | The application |
| `https://<ref>.supabase.co` | Database, auth and storage (REST + realtime) |
| `wss://<ref>.supabase.co` | Supabase realtime, if ever used |
| `https://accounts.google.com` | Google OAuth |
| `https://fonts.googleapis.com`, `https://fonts.gstatic.com` | Plus Jakarta Sans via `next/font` — note `next/font` **self-hosts**, so these may not be needed; verify before adding |
| `https://api.anthropic.com` | OCR — server-side only, so NOT a browser origin and must not be in the CSP |

When AdSense is enabled, add:

| Origin | Why |
|---|---|
| `https://pagead2.googlesyndication.com` | The ad script |
| `https://googleads.g.doubleclick.net`, `https://tpc.googlesyndication.com` | Ad frames and creatives |
| `https://www.google.com`, `https://www.gstatic.com` | Ad assets |

## The header to ship

Start in **report-only** for a week, read the reports, then enforce. Going
straight to enforcement on a live site is how a CSP takes down a checkout.

```js
// next.config.mjs, inside headers()
{
  key: 'Content-Security-Policy-Report-Only',
  value: [
    "default-src 'self'",
    // Next.js injects inline bootstrap scripts; 'unsafe-inline' is required
    // unless nonces are wired through, which is a larger change.
    "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.supabase.co https://*.googlesyndication.com https://*.doubleclick.net",
    "font-src 'self' data:",
    "connect-src 'self' https://<ref>.supabase.co wss://<ref>.supabase.co",
    "frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; '),
}
```

Notes that matter:

- **`frame-ancestors 'none'`** duplicates the existing `X-Frame-Options: DENY`.
  Keep both: the header is honoured by older browsers, the directive by newer
  ones.
- **`blob:` in `img-src`** is needed for document previews before upload.
- **`'unsafe-inline'` in `script-src`** is a real weakening. Removing it means
  threading a nonce through the Next.js document, which is worth doing but is
  not a launch-blocking change.
- **Do not add `api.anthropic.com`.** OCR runs server-side; putting it in the
  CSP would suggest the browser talks to it, which it must never do — that
  would mean the API key was client-side.

## Related decision

`Permissions-Policy: interest-cohort=()` was reviewed in Phase 10 and kept,
opting out of interest-based ad targeting. The reasoning is in
`next.config.mjs`; changing it requires changing the privacy policy too.
