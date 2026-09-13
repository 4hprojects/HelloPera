# Email — Resend + Supabase

Supabase's built-in sender is capped at roughly **2 emails per hour** and is
development-only. Signup and password reset both send email, so without a real
provider nobody can complete either.

## 1. Resend

1. Create an account at resend.com.
2. **Domains → Add Domain.** Add the domain you will send from and complete the
   DNS records it gives you (SPF, DKIM, and usually a return-path CNAME).
3. **API Keys → Create API Key.** Sending permission is enough. It starts `re_`.

### The constraint worth knowing before you start

Until a domain is verified, Resend only lets you send to **the email address on
your own Resend account**. The shared `onboarding@resend.dev` sender has the
same restriction.

So without a verified domain you can test signup with your own address and
nothing else — which is enough to prove the flow, but not enough to let anyone
else register. Verify the domain before inviting anyone.

## 2. Supabase SMTP

**Authentication → Emails → SMTP Settings**, enable custom SMTP:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (`re_...`) |
| Sender email | `noreply@yourdomain` — must be on the verified domain |
| Sender name | `HelloPera` |

Port 465 is implicit TLS. If Supabase rejects it, `587` with STARTTLS also
works.

### Rate limits

Same page, **Rate Limits**: the default of 2/hour exists because it matches the
built-in sender. Raise it once custom SMTP is on, or you will keep hitting
`over_email_send_rate_limit` with a provider that could handle far more.

## 3. Templates

**Authentication → Emails → Templates.** Paste each file into the matching
template:

| Supabase template | File |
|---|---|
| Confirm signup | `confirm-signup.html` |
| Reset password | `reset-password.html` |
| Change email address | `change-email.html` |
| Magic link | `magic-link.html` |

All four are table-based with inline styles, because email clients strip
`<style>` blocks and ignore CSS variables. Colours are literal hex from the
verified palette — `#107A66` for buttons and links, `#647080` for secondary
text — so they meet the same AA contrast target as the app.

Each one carries a line that HelloPera never asks for bank credentials or
one-time codes by email. Phishing that imitates a finance app is routine, and a
consistent stated boundary is what makes a fake one easier to spot.

`{{ .ConfirmationURL }}` is Supabase's token. Leave it exactly as written.

## 4. Redirect URLs

**Authentication → URL Configuration:**

```
Site URL       http://localhost:3000
Redirect URLs  http://localhost:3000/**
               https://<your-production-domain>/**
```

Without these, the link in the email resolves to nothing. The app sends users
to `/auth/callback`, which exchanges the code for a session.

## 5. Check it

```sh
npm run dev
```

Register at `/register` with an address Resend can reach. You should get the
branded email, and clicking through should land you on `/dashboard` signed in.

If it does not arrive, Resend's dashboard has a **Logs** tab showing every
attempt and why it failed — usually an unverified domain or a sender address
that is not on it.
