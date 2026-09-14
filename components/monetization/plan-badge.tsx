import { Badge } from '@/components/ui/badge';

/**
 * §21 — the Premium marker.
 *
 * A label, never a blocker. §21 says to avoid aggressive blocking popups, and
 * the point of marking a feature is that the user learns it exists — a hidden
 * feature cannot be wanted.
 */
export function PremiumBadge({ className }: { className?: string }) {
  return (
    <Badge tone="gold" className={className}>
      Premium
    </Badge>
  );
}
