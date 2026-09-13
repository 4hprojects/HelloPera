import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';

/**
 * §41 — "Do not show ₱0 while data is merely loading, because it may look
 * like a real balance."
 *
 * Not a single figure here, real or placeholder. The shapes mirror the
 * dashboard's own layout so the page does not jump when it arrives.
 */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5" role="status" aria-busy="true">
      <span className="sr-only">Loading your dashboard…</span>

      <Skeleton className="h-36 w-full rounded-2xl" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-3.5 w-24" />
            </div>
            <Skeleton className="mt-3 h-8 w-32" />
            <Skeleton className="mt-2 h-3 w-28" />
          </Card>
        ))}
      </div>

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
