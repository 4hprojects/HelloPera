import { TextField, type TextFieldProps } from '@/components/ui/field';

/**
 * Labelled text input with a floating label and a reserved error slot.
 *
 * A thin alias over `TextField`, kept because 35 call sites and every server
 * action's `FormData` contract are written against this name. New code can
 * use either; they are the same component.
 */
export function FormField(props: TextFieldProps) {
  return <TextField wrapClassName="mb-4" {...props} />;
}
