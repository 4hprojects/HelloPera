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

export const fullNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name')
  .max(80, 'Name must be 80 characters or fewer');

export const registerSchema = z
  .object({
    fullName: fullNameSchema.optional().or(z.literal('')),
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
  fullName: fullNameSchema,
  timezone: z.string().min(1).max(64),
  defaultCurrency: z
    .string()
    .length(3, 'Use a 3-letter currency code')
    .transform((v) => v.toUpperCase()),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
