import { archiveAccountAction } from '@/app/actions/finance';
import { Button } from '@/components/ui/button';

/** Archive or restore, behind a confirm step. History is always kept. */
export function ArchiveAccountForm({ id, archived }: { id: string; archived: boolean }) {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-primary-text">
        {archived ? 'Restore account' : 'Archive account'}
      </summary>
      <p className="hp-small mb-3">
        {archived
          ? 'Restoring brings the account back into your balances and lets it receive transactions again.'
          : 'History is kept. Archived accounts cannot receive new transactions and are excluded from dashboard balances.'}
      </p>
      <form action={archiveAccountAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="archived" value={String(!archived)} />
        <Button type="submit" variant="secondary">
          {archived ? 'Confirm restore' : 'Confirm archive'}
        </Button>
      </form>
    </details>
  );
}
