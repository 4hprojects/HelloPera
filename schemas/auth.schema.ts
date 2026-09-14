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
 * Both are OPTIONAL, everywhere. The name is used to say hello on the
 * dashboard and to draw avatar initials — neither is worth a required field on
 * the one screen where friction costs most, and a person who would rather not
 * give it should not have to invent one.
 *
 * That also fixes a real bug. `updateProfileSchema` used to require the name
 * while `registerSchema` did not, so anyone who signed up without one could
 * never save their settings at all: the timezone form rejected its own blank
 * name field before it got to the timezone.
 *
 * 40 each rather than 80, because the generated `full_name` joins them with a
 * space and the display surfaces were measured against 80 total.
 */
const namePart = (label: string) =>
  z
    .string()
    .trim()
    .max(40, `${label} must be 40 characters or fewer`)
    .optional()
    .or(z.literal(''));

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
