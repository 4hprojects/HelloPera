import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';

/** §41 — no amounts while loading, real or placeholder. */
export default function RecurringLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading your recurring rules…</span>

      <Skeleton className="h-8 w-40" />

      <Card>
        <Skeleton className="h-5 w-24" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
