import { cn } from '@/lib/utils/cn';

/**
 * Initials disc — the "JD" mark in the showcase's rail and top bar.
 *
 * Decorative: the name it stands for is always rendered beside it, or is the
 * accessible name of the control that wraps it, so the disc itself is hidden
 * from assistive technology rather than read out as two stray letters.
 */
export function Avatar({
  name,
  size = 40,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const initials =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('') || '?';

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'bg-primary-fill font-semibold text-on-primary',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}
