import { FormAlert } from '@/components/auth/form-alert';

/** Shown instead of data when an admin read failed. Never rendered as zero. */
export function Unavailable({ what, reference }: { what: string; reference: string }) {
  return (
    <FormAlert tone="error">
      {what} could not be loaded, so nothing is shown rather than a number that might be
      wrong. Reference <span className="font-mono">{reference}</span> — quote it when
      checking the logs.
    </FormAlert>
  );
}
