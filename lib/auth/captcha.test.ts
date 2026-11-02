import { describe, expect, it } from 'vitest';
import { CAPTCHA_FIELD, captchaFrom } from './captcha';

function form(token?: string): FormData {
  const data = new FormData();
  if (token !== undefined) data.set(CAPTCHA_FIELD, token);
  return data;
}

describe('captchaFrom', () => {
  it('sends no token when Turnstile is not configured', () => {
    expect(captchaFrom(form('abc'), false)).toEqual({ ok: true, token: undefined });
  });

  it('passes the token through when configured', () => {
    expect(captchaFrom(form(' abc '), true)).toEqual({ ok: true, token: 'abc' });
  });

  it('refuses a missing or blank token when configured', () => {
    expect(captchaFrom(form(), true)).toEqual({ ok: false });
    expect(captchaFrom(form('  '), true)).toEqual({ ok: false });
  });
});
