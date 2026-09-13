import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/states';

export default function NotificationsLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-4" role="status" aria-busy="true">
      <span className="sr-only">Loading your notifications…</span>
      <Skeleton className="h-8 w-40" />
      <Card>
        <Skeleton className="h-5 w-28" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    </div>
  );
}
