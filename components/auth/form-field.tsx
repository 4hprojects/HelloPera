import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils/cn';

/**
 * Labelled text input with a reserved error slot.
 *
 * The slot is always in the DOM at a fixed minimum height, so an error
 * appearing does not push everything below it downward — which on a form
 * matters because the thing below is usually the submit button, and the thumb
 * is usually already moving toward it.
 *
 * `name` is derived from `id`, which is what the server actions read from
 * `FormData`.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  /** Shown under the field while there is no error. */
  hint?: string;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className="mb-4">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={cn(error && 'border-danger', className)}
        {...props}
      />

      {/* One slot, two states — so the height never changes between them. */}
      <p
        id={error ? errorId : hintId}
        role={error ? 'alert' : undefined}
        className={cn(
          'hp-small mt-1 min-h-[1.125rem]',
          error ? 'text-danger-text' : 'text-text-muted',
          !error && !hint && 'invisible',
        )}
      >
        {error ?? hint ?? ' '}
      </p>
    </div>
  );
}
