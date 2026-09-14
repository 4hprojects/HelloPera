/**
 * Password strength — keyed to LENGTH, deliberately.
 *
 * `schemas/auth.schema.ts` records the rule and the reasoning:
 *
 * > Minimum 8 characters, and nothing else (§13). Deliberately not requiring
 * > symbol/number/case mixes… Length is what matters.
 *
 * helloRun's signup meter scores five criteria and gates submit on uppercase +
 * lowercase + number. Copying that here would contradict a decision this
 * project already made on purpose — and worse, it would show a user a "Weak"
 * bar for a passphrase that is genuinely strong and that the server will
 * happily accept. A meter that disagrees with the validator teaches people to
 * ignore the meter.
 *
 * So this measures the thing the rule actually cares about.
 */

export type PasswordStrength = {
  /** 0–4. 0 means too short to accept at all. */
  score: 0 | 1 | 2 | 3 | 4;
  /**
   * The word shown beside the bar.
   *
   * DESIGN-SYSTEM §4.1 — colour is never the only signal. This label is the
   * information; the bar's colour and width merely repeat it, so the meter
   * still reads in greyscale and to a screen reader.
   */
  label: string;
  /** Percentage width for the bar. */
  percent: number;
};

/** The minimum the server enforces. Mirrors `passwordSchema`. */
export const MIN_LENGTH = 8;
/** bcrypt truncates past this, so the schema caps it. */
export const MAX_LENGTH = 72;

export function passwordStrength(password: string): PasswordStrength {
  const length = password.length;

  if (length === 0) return { score: 0, label: '', percent: 0 };

  if (length < MIN_LENGTH) {
    // Not a judgement — a statement of fact the server will repeat.
    return { score: 0, label: `${MIN_LENGTH - length} more to go`, percent: 15 };
  }

  if (length < 12) return { score: 1, label: 'Okay', percent: 40 };
  if (length < 16) return { score: 2, label: 'Good', percent: 65 };
  if (length < 20) return { score: 3, label: 'Strong', percent: 85 };
  return { score: 4, label: 'Very strong', percent: 100 };
}

/** Does this meet the rule the server enforces? */
export function meetsMinimum(password: string): boolean {
  return password.length >= MIN_LENGTH && password.length <= MAX_LENGTH;
}
