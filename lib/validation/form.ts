import { z } from 'zod';
import { log } from '@/lib/log';

/**
 * Strict request-shape checks for server actions.
 *
 * Actions read their fields by name, so an extra field was never *used* — but
 * it was silently accepted, and a renamed or forgotten field went unnoticed.
 * These schemas make the accepted shape explicit and refuse anything else:
 *
 *  - unknown keys are rejected (strict object), so a request cannot carry
 *    `user_id`, `role`, `status` or any other field the form does not have;
 *  - every value must be a single string — a repeated key or a file where text
 *    was expected is rejected rather than coerced;
 *  - semantic validation (amounts, dates, enums) stays in each action's own
 *    domain schema. This layer is about shape only.
 *
 * React strips its own `$ACTION_*` keys before calling an action, so the
 * FormData an action receives holds only the form's fields. They are skipped
 * here anyway so a change in that behaviour cannot reject every form.
 */

const value = z.string().max(20_000).optional();

export type FormSchema = z.ZodType<Record<string, string | undefined>> & {
  readonly fields: readonly string[];
};

/** A strict schema accepting exactly `fields`, each optional. */
export function formSchema(
  fields: readonly string[],
  options: { patterns?: readonly RegExp[] } = {},
): FormSchema {
  const shape = Object.fromEntries(fields.map((field) => [field, value]));
  const patterns = options.patterns ?? [];

  const schema = patterns.length
    ? // Indexed fields (`d3.amount`) cannot be listed up front, so keys that
      // match a pattern are allowed through and everything else still fails.
      z
        .object(shape)
        .catchall(value)
        .superRefine((data, ctx) => {
          for (const key of Object.keys(data)) {
            if (key in shape || patterns.some((p) => p.test(key))) continue;
            ctx.addIssue({ code: 'unrecognized_keys', keys: [key], input: data });
          }
        })
    : z.strictObject(shape);

  return Object.assign(schema, { fields }) as unknown as FormSchema;
}

/** FormData to a plain object; repeated keys become arrays so they fail. */
function toObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  formData.forEach((entry, key) => {
    if (key.startsWith('$ACTION_')) return;
    const current = out[key];
    if (current === undefined) out[key] = entry;
    else out[key] = Array.isArray(current) ? [...current, entry] : [current, entry];
  });
  return out;
}

export const REJECTED_FORM = 'This request included fields that are not allowed.';

/** True when `formData` matches `schema` exactly. */
export function isAllowedForm(formData: FormData, schema: FormSchema): boolean {
  return schema.safeParse(toObject(formData)).success;
}

/**
 * True when the request must be refused. Logs the offending field names (never
 * their values): a form that starts sending a new field shows up here instead
 * of failing silently.
 */
export function formRejected(
  formData: FormData,
  schema: FormSchema,
  action: string,
): boolean {
  if (isAllowedForm(formData, schema)) return false;
  log.warn('action refused: unexpected form fields', {
    action,
    fields: rejectedFields(formData, schema).join(','),
  });
  return true;
}

/** Field names that made a FormData fail — for logs and tests, never for users. */
export function rejectedFields(formData: FormData, schema: FormSchema): string[] {
  const result = schema.safeParse(toObject(formData));
  if (result.success) return [];
  return [
    ...new Set(
      result.error.issues.flatMap((issue) =>
        issue.code === 'unrecognized_keys' ? issue.keys : issue.path.map(String),
      ),
    ),
  ];
}
