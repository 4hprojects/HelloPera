'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { appUrl } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { recordAuditEvent } from '@/lib/auth/audit';
import {
  RateLimitError,
  enforceRateLimit,
  enforceRateLimitWithIp,
} from '@/services/rate-limit.service';
import { log } from '@/lib/log';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '@/schemas/auth.schema';

export type ActionState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
};

/**
 * Translate provider errors into something a person can act on (§41).
 * Raw provider text leaks implementation detail and is often unhelpful.
 */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Invalid email or password.';
  if (m.includes('email not confirmed'))
    return 'Please verify your email before signing in.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'That email is already registered. Try signing in instead.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (m.includes('expired') || m.includes('invalid') || m.includes('token')) {
    return 'That link is invalid or has expired. Request a new one.';
  }
  if (m.includes('weak password')) return 'Choose a stronger password.';
  return 'Something went wrong. Please try again.';
}

function fieldErrorsFrom(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

async function originUrl(): Promise<string> {
  const h = await headers();
  const origin = h.get('origin');
  if (origin) return origin;
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  // Prefer the real request host; fall back to the configured origin, which is
  // localhost in development so links do not point at a domain serving nothing.
  return host ? `${proto}://${host}` : appUrl();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function registerWithEmail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get('fullName') ?? '',
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // Master plan §54a gate item. Applied AFTER validation, so a malformed form
  // does not consume someone's budget, and before the provider call, so abuse
  // never reaches it.
  try {
    await enforceRateLimitWithIp('register', parsed.data.email);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.userMessage };
    throw error;
  }

  const supabase = await createClient();
  const origin = await originUrl();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // full_name only. The trigger hardcodes role and status; user metadata
      // is client-controlled and must never influence authorization.
      data: parsed.data.fullName ? { full_name: parsed.data.fullName } : undefined,
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    log.warn('registration failed', { code: error.code ?? 'unknown' });
    return { error: friendlyAuthError(error.message) };
  }

  await recordAuditEvent({
    eventType: 'user_registered',
    actorUserId: data.user?.id ?? null,
    metadata: { method: 'email' },
  });

  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export async function loginWithEmail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // The tightest limit, keyed by both email and IP: the first stops one
  // account being ground down, the second stops one source spraying many
  // accounts — which the per-email limit alone would never see.
  try {
    await enforceRateLimitWithIp('login', parsed.data.email);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.userMessage };
    throw error;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    log.warn('login failed', { code: error.code ?? 'unknown' });
    return { error: friendlyAuthError(error.message) };
  }

  // Status is checked here as well as in the guards, so a blocked account
  // never reaches an authenticated page even briefly.
  //
  // Read with the user's own session, not the service role: they just
  // authenticated, and RLS grants SELECT on their own profile. Using the
  // privileged client here would make sign-in depend on a key it does not
  // need, and would break login entirely before that key is configured.
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', data.user.id)
    .maybeSingle<{ status: string }>();

  await recordAuditEvent({
    eventType: 'user_logged_in',
    actorUserId: data.user.id,
    metadata: { method: 'password' },
  });

  if (profile?.status === 'suspended') redirect('/account-suspended');
  if (profile?.status === 'disabled') redirect('/account-disabled');

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function loginWithGoogle(): Promise<ActionState> {
  const supabase = await createClient();
  const origin = await originUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback?next=/dashboard`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });

  if (error || !data.url) {
    log.warn('google oauth start failed', { code: error?.code ?? 'no_url' });
    return { error: 'Google sign-in is unavailable right now. Please try again.' };
  }

  redirect(data.url);
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  const supabase = await createClient();
  await supabase.auth.signOut();

  if (user) {
    await recordAuditEvent({ eventType: 'user_logged_out', actorUserId: user.id });
  }

  revalidatePath('/', 'layout');
  redirect('/login');
}

// ---------------------------------------------------------------------------
// Password recovery
// ---------------------------------------------------------------------------

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // Scarcer than the others: each attempt emails someone who may not have
  // asked for it, so this limit protects the inbox owner as much as the
  // server.
  try {
    await enforceRateLimitWithIp('password_reset_request', parsed.data.email);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.userMessage };
    throw error;
  }

  const supabase = await createClient();
  const origin = await originUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) log.warn('password reset request failed', { code: error.code ?? 'unknown' });

  await recordAuditEvent({
    eventType: 'password_reset_requested',
    metadata: { requested: true },
  });

  // Always the same response, success or failure. Distinguishing them would
  // turn this form into an account-enumeration oracle.
  return {
    success:
      'If an account exists for that email, we have sent a password reset link. ' +
      'Check your inbox and spam folder.',
  };
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { error: 'That reset link is invalid or has expired. Request a new one.' };
  }

  // Keyed on the user the reset link resolved to — the form carries no email.
  try {
    await enforceRateLimit('password_reset_confirm', userData.user.id);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.userMessage };
    throw error;
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    log.warn('password reset failed', { code: error.code ?? 'unknown' });
    return { error: friendlyAuthError(error.message) };
  }

  await recordAuditEvent({
    eventType: 'password_reset_completed',
    actorUserId: userData.user.id,
  });

  revalidatePath('/', 'layout');
  redirect('/dashboard?reset=1');
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get('fullName'),
    timezone: formData.get('timezone'),
    defaultCurrency: formData.get('defaultCurrency'),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const admin = createAdminClient();

  const { data: before } = await admin
    .from('profiles')
    .select('full_name, timezone, default_currency')
    .eq('id', user.id)
    .maybeSingle();

  // Explicit column list. Ownership comes from the session, never the form —
  // this is the whole reason writes run server-side.
  const { error } = await admin
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      timezone: parsed.data.timezone,
      default_currency: parsed.data.defaultCurrency,
    })
    .eq('id', user.id);

  if (error) {
    log.error('profile update failed', { code: error.code });
    return { error: 'We could not save your changes. Please try again.' };
  }

  await recordAuditEvent({
    eventType: 'profile_updated',
    actorUserId: user.id,
    metadata: {
      changed_name: before?.full_name !== parsed.data.fullName,
      changed_timezone: before?.timezone !== parsed.data.timezone,
      changed_currency: before?.default_currency !== parsed.data.defaultCurrency,
    },
  });

  revalidatePath('/settings');
  return { success: 'Your settings have been saved.' };
}
