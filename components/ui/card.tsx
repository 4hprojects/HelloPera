import * as React from 'react';
import { cn } from '@/lib/utils/cn';

/**
 * Surface card — the showcase's white panel: 16px radius, a hairline border
 * and a shadow soft enough to read as lift rather than as a second border.
 *
 * The border stays even in dark mode, where the shadow does nothing: without
 * it the panel and the page ground are two near-identical darks.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(19,34,56,0.04),0_8px_24px_-12px_rgba(19,34,56,0.10)] sm:p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('hp-h3 text-text', className)} {...props} />;
}

export function CardLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('hp-label text-text-muted', className)} {...props} />;
}

/**
 * A card with the showcase's header row: title on the left, a "View all"
 * link or a period control on the right.
 */
export function SectionCard({
  title,
  action,
  bodyClassName,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  bodyClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <CardTitle>{title}</CardTitle>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn('flex-1', bodyClassName)}>{children}</div>
    </Card>
  );
}

/**
 * Rounded square icon well — the tinted chip above each stat in the
 * showcase, and the leading chip on each transaction row.
 */
const chipTones = {
  primary: 'bg-tint-primary text-primary-text',
  success: 'bg-tint-success text-success-text',
  warning: 'bg-tint-warning text-warning-text',
  danger: 'bg-tint-danger text-danger-text',
  gold: 'bg-tint-gold text-gold-text',
  neutral: 'bg-tint-ink text-ink-text',
} as const;

export type ChipTone = keyof typeof chipTones;

export function IconChip({
  tone = 'primary',
  size = 40,
  className,
  children,
}: {
  tone?: ChipTone;
  size?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl',
        chipTones[tone],
        className,
      )}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}
