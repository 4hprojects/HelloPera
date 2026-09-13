import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';

/**
 * §41 — no figure here, real or placeholder. A projected "₱0" is
 * indistinguishable from a genuine projection of nothing, and on this page
 * that reads as "you will run out".
 */
export default function ForecastLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Preparing your forecast…</span>

      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-7 w-full max-w-md rounded-full" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-32" />
          </Card>
        ))}
      </div>

      <Card>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-52 w-full" />
      </Card>

      <Card>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-32 w-full" />
      </Card>
    </div>
  );
}
