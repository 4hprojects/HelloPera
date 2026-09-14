/register - refine do it like hellorun.online /signup  [done]
  - the fullname should be first and last name 2 text box  [done]

landing page - improve landing page  [done]

---

Done 14 Sep 2026. See commits 85f0474, 00bd68e, 887c0d3 — plus a2b8586,
which was not on this list: the new brand set broke `npm run icons`, so the
mark had to be rewired before either page could carry it.

Worth knowing:

- /register and /login now share one shell (components/auth/auth-shell.tsx).
  Change one and the other follows.
- A real bug turned up in components/auth/google-button.tsx: a failed Google
  sign-in was showing the user nothing at all. Fixed.
- The password meter keys on LENGTH, because schemas/auth.schema.ts
  deliberately requires length and nothing else. helloRun's gates on
  character classes — copying it would have contradicted that.
- Every public route is still statically rendered.

Not done, and deliberately:

- No dashboard screenshot on the landing page. The showcase PNG is a mockup
  with invented balances; using it as a product shot would show fake figures
  as real. Illustration is inline SVG instead.
- The UI palette was not re-derived from the new logo art. Every --hp-* token
  carries a measured contrast ratio, and DESIGN-SYSTEM §3.4 already settled
  that the wordmark uses UI colours rather than logo colours.

Still unverified: none of this has been seen in a browser. It compiles,
builds and type-checks, but the app has never been run against a database.
