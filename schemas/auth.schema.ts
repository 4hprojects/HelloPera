import { z } from 'zod';

/**
 * Auth validation — Phase 01 §45.
 *
 * The same schemas run on the client for UX and on the server for authority.
 * Client validation is a convenience; the server never trusts it.
 */

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Enter a valid email address')
  .transform((value) => value.trim().toLowerCase());

/**
 * Minimum 8 characters, and nothing else (§13).
 *
 * Deliberately not requiring symbol/number/case mixes: those rules push people
 * toward predictable substitutions and a sticky note, and they measurably
 * reduce entropy in practice. Length is what matters.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer');

/**
 * Name parts.
 *
 * Both are REQUIRED, everywhere — at registration and in settings alike. They
 * were optional once (the name only says hello and draws avatar initials), and
 * that choice is reversed: an account should carry a real name.
 *
 * Keep the two schemas in step. They disagreed once — settings required a name
 * while registration did not — and anyone who signed up without one could never
 * save their timezone, because the settings form rejected its own blank name
 * field. Both sharing `namePart` is what prevents a repeat.
 *
 * Accounts made through Google take the name Google supplies. If Google sends
 * none, the profile has none and the settings form asks for it — the same rule,
 * not a special case.
 *
 * 40 each rather than 80, because the generated `full_name` joins them with a
 * space and the display surfaces were measured against 80 total.
 */
const namePart = (label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(40, `${label} must be 40 characters or fewer`);

export const firstNameSchema = namePart('First name');
export const lastNameSchema = namePart('Last name');

export const registerSchema = z
  .object({
    firstName: firstNameSchema,
    lastName: lastNameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/**
 * Profile update allowlist.
 *
 * role, status, email and id are absent by construction — there is no code
 * path that accepts them from a request (§34).
 */
export const updateProfileSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  timezone: z.string().min(1).max(64),
  defaultCurrency: z
    .string()
    .length(3, 'Use a 3-letter currency code')
    .transform((v) => v.toUpperCase()),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
