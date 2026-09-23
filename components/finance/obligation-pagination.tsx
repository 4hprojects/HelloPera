import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';
export function ObligationPagination({
  page,
  hasNext,
  href,
}: {
  page: number;
  hasNext: boolean;
  href: string;
}) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <span>Page {page}</span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link className={buttonClass('ghost')} href={`${href}?page=${page - 1}`}>
            Previous
          </Link>
        )}
        {hasNext && (
          <Link className={buttonClass('ghost')} href={`${href}?page=${page + 1}`}>
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
