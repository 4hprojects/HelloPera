import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * The floating-label field: one box, one label, one message slot.
 *
 * Patterned on helloRun's signup form — the label rests over the control while
 * it is empty, then floats to the top edge once there is a value or focus.
 * The geometry and the state machine live in `app/globals.css` under
 * "Form fields"; this file's job is to render the right markup and translate
 * props into the `data-*` attributes those rules key off.
 *
 * ## Markup order is not negotiable
 *
 * Control, then label, then message. The float is a sibling selector on the
 * control's own pseudo-state (`:not(:placeholder-shown)`, `:autofill`,
 * `:has(option[value='']:checked)`), so the label has to come after it.
 * `htmlFor`/`id` carries the accessible name, which does not care about DOM
 * order — that is the whole point of `for`.
 *
 * ## Never pass a border or padding class to a control
 *
 * `app/globals.css` is unlayered and loads after `@import 'tailwindcss'`, so
 * its rules beat every Tailwind utility regardless of specificity. A
 * `className="pr-16"` on a control does not shorten the padding; it does
 * nothing at all. Hence:
 *
 *   - **Geometry** — width, margin, grid placement — goes on the wrapper, via
 *     `wrapClassName`.
 *   - **State** — invalid, tone, size, adorned — is a typed prop that becomes
 *     a `data-*` attribute.
 *
 * Every override that used to be a className is a prop here for that reason.
 * Resist adding a `className` passthrough to the control.
 */

type FieldSize = 'md' | 'sm';
type FieldTone = 'default' | 'warning';
type FieldVariant = 'default' | 'search';

/** Types whose control paints its own text from first render, so the label
 *  can never rest over them without colliding. */
const ALWAYS_FLOATED_TYPES = new Set(['date', 'time', 'datetime-local', 'month', 'week']);

export type FieldMeta = {
  /** Also becomes `name` unless one is passed — the server actions read
   *  `FormData` by this key. */
  id: string;
  label: string;
  error?: string;
  /** Shown under the field while there is no error. */
  hint?: string;
  /** `sm` is exactly 44px, for filter chrome. Default `md` (52px). */
  size?: FieldSize;
  /** `warning` is the low-confidence OCR amber. */
  tone?: FieldTone;
  /** `search` is the header's pill. See globals.css for why it opts out. */
  variant?: FieldVariant;
  /** Keep the label floated regardless of value. Inferred for date/time. */
  floatAlways?: boolean;
  /** Reserve the message slot. Off for filter rows, which have no errors. */
  showMessage?: boolean;
  /** Visually hide the label, keeping it for screen readers. */
  labelHidden?: boolean;
  /** Wrapper geometry only: width, margin, grid placement. Never borders. */
  wrapClassName?: string;
  /** Rendered inside the box, right-aligned. Reserves padding for itself. */
  adornment?: React.ReactNode;
  /** Rendered inside the box, left-aligned. Decorative, never interactive. */
  leadingIcon?: React.ReactNode;
  /** Rendered between the field and the message slot — PasswordField's meter. */
  belowField?: React.ReactNode;
};

/**
 * The chrome around a control: wrapper, floating label, message slot.
 *
 * Use it directly when you need a control this file does not wrap. Pass the
 * control as `control` — it must carry the `hp-control` class, the `id`, and
 * its own `aria-invalid` / `aria-describedby`; `describedBy` and `errorId` /
 * `hintId` are exported below so a caller can build those consistently.
 */
export function FieldShell({
  id,
  label,
  error,
  hint,
  size = 'md',
  tone = 'default',
  variant = 'default',
  floatAlways,
  showMessage = true,
  labelHidden,
  wrapClassName,
  adornment,
  leadingIcon,
  control,
  belowField,
}: FieldMeta & { control: React.ReactNode }) {
  return (
    <div className={wrapClassName}>
      <div
        className="hp-field"
        data-size={size === 'sm' ? 'sm' : undefined}
        data-tone={tone === 'warning' ? 'warning' : undefined}
        data-variant={variant === 'search' ? 'search' : undefined}
        data-invalid={error ? '' : undefined}
        data-adorned={adornment ? '' : undefined}
        data-float={floatAlways ? 'always' : undefined}
      >
        {control}

        {/* After the control: the float is a sibling selector. */}
        <label htmlFor={id} className={cn('hp-float', labelHidden && 'sr-only')}>
          {label}
        </label>

        {leadingIcon ? (
          <span aria-hidden="true" className="hp-field-icon">
            {leadingIcon}
          </span>
        ) : null}

        {adornment}
      </div>

      {belowField}

      {/*
        One slot, two states — so the height never changes between them.

        An error appearing must not push everything below it downward, because
        the thing below is usually the submit button and the thumb is usually
        already moving toward it. helloRun collapses this slot to `height: 0`
        and animates it open; that is the worse pattern, and the reason is
        this sentence. Do not "fix" it toward the reference.
      */}
      {showMessage ? (
        <p
          id={error ? errorId(id) : hintId(id)}
          role={error ? 'alert' : undefined}
          className={cn(
            'hp-small mt-1 min-h-[1.125rem]',
            error ? 'text-danger-text' : 'text-text-muted',
            !error && !hint && 'invisible',
          )}
        >
          {error ?? hint ?? ' '}
        </p>
      ) : null}
    </div>
  );
}

export const errorId = (id: string) => `${id}-error`;
export const hintId = (id: string) => `${id}-hint`;

/** Which id, if any, describes this field right now. */
function describedBy(id: string, error?: string, hint?: string) {
  if (error) return errorId(id);
  if (hint) return hintId(id);
  return undefined;
}

/** Props every control shares once the shell has taken the chrome props. */
function splitMeta<T extends FieldMeta>(props: T) {
  const {
    id,
    label,
    error,
    hint,
    size,
    tone,
    variant,
    floatAlways,
    showMessage,
    labelHidden,
    wrapClassName,
    adornment,
    leadingIcon,
    belowField,
    ...rest
  } = props;
  return {
    meta: {
      id,
      label,
      error,
      hint,
      size,
      tone,
      variant,
      floatAlways,
      showMessage,
      labelHidden,
      wrapClassName,
      adornment,
      leadingIcon,
      belowField,
    } satisfies FieldMeta,
    rest,
  };
}

export type TextFieldProps = FieldMeta &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className' | 'size'> & {
    ref?: React.Ref<HTMLInputElement>;
  };

/**
 * Text input. Covers every `type` except file, checkbox and radio — those are
 * not fields in this sense and keep `Label` above them.
 *
 * `placeholder` defaults to a single space and is load-bearing: the float and
 * the filled border both hang off `:placeholder-shown`, which never matches
 * without one. A real placeholder is welcome — it is hidden at rest and
 * revealed on focus, as a format example underneath the floated label.
 */
export function TextField(props: TextFieldProps) {
  const { meta, rest } = splitMeta(props);
  const { id, error, hint } = meta;
  const { placeholder = ' ', type, name, ...inputProps } = rest;

  return (
    <FieldShell
      {...meta}
      floatAlways={meta.floatAlways ?? (type ? ALWAYS_FLOATED_TYPES.has(type) : false)}
      control={
        <input
          id={id}
          name={name ?? id}
          type={type}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="hp-control"
          {...inputProps}
        />
      }
    />
  );
}

export type SelectFieldProps = FieldMeta &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className' | 'size'> & {
    ref?: React.Ref<HTMLSelectElement>;
  };

/**
 * Select.
 *
 * A select's label is always floated, and the CSS does that on the element
 * itself — an empty select still paints its own option text ("No category"),
 * so there is nothing for a resting label to sit over without colliding.
 *
 * The jade filled border still distinguishes chosen from not: a select with a
 * leading `<option value="">` takes it only once something else is picked,
 * which is what makes an active filter visible in a filter row.
 */
export function SelectField(props: SelectFieldProps) {
  const { meta, rest } = splitMeta(props);
  const { id, error, hint } = meta;
  const { name, children: options, ...selectProps } = rest;

  return (
    <FieldShell
      {...meta}
      control={
        <select
          id={id}
          name={name ?? id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="hp-control"
          {...selectProps}
        >
          {options}
        </select>
      }
    />
  );
}

export type TextareaFieldProps = FieldMeta &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> & {
    ref?: React.Ref<HTMLTextAreaElement>;
  };

/** Multi-line text. The label parks near the first line, not the box's centre. */
export function TextareaField(props: TextareaFieldProps) {
  const { meta, rest } = splitMeta(props);
  const { id, error, hint } = meta;
  const { placeholder = ' ', name, ...textareaProps } = rest;

  return (
    <FieldShell
      {...meta}
      control={
        <textarea
          id={id}
          name={name ?? id}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, error, hint)}
          className="hp-control"
          {...textareaProps}
        />
      }
    />
  );
}
