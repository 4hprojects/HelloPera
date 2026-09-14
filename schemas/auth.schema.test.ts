import { describe, expect, it } from 'vitest';
import { registerSchema, updateProfileSchema } from '@/schemas/auth.schema';

const valid = {
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  email: 'juan@example.com',
  password: 'a-long-enough-passphrase',
  confirmPassword: 'a-long-enough-passphrase',
};

describe('registerSchema — names are optional', () => {
  it('accepts both names', () => {
    const r = registerSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('accepts a signup with no name at all', () => {
    // The whole point: the name is only used to say hello.
    const r = registerSchema.safeParse({ ...valid, firstName: '', lastName: '' });
    expect(r.success).toBe(true);
  });

  it('accepts a first name with no surname', () => {
    const r = registerSchema.safeParse({ ...valid, lastName: '' });
    expect(r.success).toBe(true);
  });

  it('keeps a multi-word surname intact', () => {
    // "Dela Cruz" must not be truncated at the space — the reason the field
    // was split rather than parsed out of one string.
    const r = registerSchema.safeParse(valid);
    expect(r.success && r.data.lastName).toBe('Dela Cruz');
  });

  it('trims surrounding whitespace', () => {
    const r = registerSchema.safeParse({ ...valid, firstName: '  Juan  ' });
    expect(r.success && r.data.firstName).toBe('Juan');
  });

  it('rejects a name past the cap', () => {
    const r = registerSchema.safeParse({ ...valid, firstName: 'x'.repeat(41) });
    expect(r.success).toBe(false);
  });

  it('still enforces the password rules', () => {
    expect(
      registerSchema.safeParse({ ...valid, password: 'short', confirmPassword: 'short' })
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ ...valid, confirmPassword: 'different-passphrase' })
        .success,
    ).toBe(false);
  });

  it('still requires a valid email', () => {
    expect(registerSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(
      false,
    );
    expect(registerSchema.safeParse({ ...valid, email: '' }).success).toBe(false);
  });
});

describe('updateProfileSchema — the settings bug this fixes', () => {
  const settings = {
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    timezone: 'Asia/Manila',
    defaultCurrency: 'php',
  };

  it('lets a user with no name save their settings', () => {
    // Previously fullName was REQUIRED here while optional at registration,
    // so anyone who signed up without a name could not change their timezone
    // or currency — the form rejected its own blank name field first.
    const r = updateProfileSchema.safeParse({ ...settings, firstName: '', lastName: '' });
    expect(r.success).toBe(true);
  });

  it('accepts a normal update', () => {
    expect(updateProfileSchema.safeParse(settings).success).toBe(true);
  });

  it('upper-cases the currency code', () => {
    const r = updateProfileSchema.safeParse(settings);
    expect(r.success && r.data.defaultCurrency).toBe('PHP');
  });

  it('rejects a currency that is not three letters', () => {
    expect(
      updateProfileSchema.safeParse({ ...settings, defaultCurrency: 'PESO' }).success,
    ).toBe(false);
  });

  it('still requires a timezone', () => {
    expect(updateProfileSchema.safeParse({ ...settings, timezone: '' }).success).toBe(
      false,
    );
  });

  it('agrees with registerSchema on what a name may be', () => {
    // Two schemas disagreeing about the same field is exactly how the bug
    // above happened.
    for (const name of ['', 'Juan', '  Ana  ', 'x'.repeat(40)]) {
      expect(
        updateProfileSchema.safeParse({ ...settings, firstName: name }).success,
        name,
      ).toBe(registerSchema.safeParse({ ...valid, firstName: name }).success);
    }
  });
});
