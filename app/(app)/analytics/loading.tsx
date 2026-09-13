import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';

/**
 * §41 — no figure here, real or placeholder, because "₱0" while loading is
 * indistinguishable from a real balance of zero.
 */
export default function AnalyticsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5" role="status" aria-busy="true">
      <span className="sr-only">Loading your analytics…</span>

      <Skeleton className="h-8 w-40" />

      <Card>
        <Skeleton className="h-7 w-full max-w-lg rounded-full" />
        <Skeleton className="mt-3 h-10 w-full" />
      </Card>

      <Card>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-4 h-24 w-full" />
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i}>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="mt-4 h-40 w-full" />
          </Card>
        ))}
      </div>

      <Card>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-4 h-52 w-full" />
      </Card>
    </div>
  );
}
