import * as React from 'react';
import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

/**
 * The showcase's three button weights, plus a destructive one.
 *
 *   primary    filled jade, white label, usually with a trailing arrow
 *   secondary  soft jade wash, jade label — no border
 *   ghost      transparent with a jade outline
 *
 * Solid fills use --color-primary-fill, not --color-primary: white on the
 * brand jade is 4.28:1, which fails AA for a normal-size label. The wash
 * behind `secondary` puts its jade label at 4.56:1.
 */
const variants: Record<Variant, string> = {
  primary: 'bg-primary-fill text-on-primary hover:opacity-90',
  secondary: 'bg-primary-wash text-primary-text hover:opacity-80',
  ghost: 'bg-transparent text-primary-text border border-primary hover:bg-primary-wash',
  danger: 'bg-transparent text-danger-text border border-danger hover:bg-tint-danger',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[0.9375rem]',
  lg: 'h-12 px-6 text-base',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full',
        'font-semibold transition-opacity',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

/** The same three weights as class strings, for `<Link>` and `<a>`. */
export const buttonClass = (
  variant: Variant = 'primary',
  size: Size = 'md',
  className?: string,
) =>
  cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-opacity',
    variants[variant],
    sizes[size],
    className,
  );
