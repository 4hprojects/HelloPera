/**
 * Turnstile token handling for the auth actions.
 *
 * Supabase verifies the token; this module only gets it out of the form. It
 * imports nothing server-only, so the widget can share the field name.
 */

/** The hidden input Turnstile writes its token into. */
export const CAPTCHA_FIELD = 'cf-turnstile-response';

export const CAPTCHA_REQUIRED_MESSAGE = 'Please complete the security verification.';

export type CaptchaResult = { ok: true; token: string | undefined } | { ok: false };

/**
 * Read the token from a submitted form.
 *
 * `required` is whether a site key is configured. When it is, a missing token
 * is refused here rather than sent to Supabase, which would spend a rate-limit
 * attempt to report the same thing less clearly. When it is not, no token is
 * sent at all.
 */
export function captchaFrom(formData: FormData, required: boolean): CaptchaResult {
  if (!required) return { ok: true, token: undefined };
  const token = String(formData.get(CAPTCHA_FIELD) ?? '').trim();
  return token ? { ok: true, token } : { ok: false };
}
