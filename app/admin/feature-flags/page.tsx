import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AdminForm } from '@/components/admin/admin-form';
import { requireAdmin } from '@/lib/auth/guards';
import {
  FLAG_GROUP_ORDER,
  FLAG_GROUP_TITLES,
  flagInfo,
  type FlagInfo,
} from '@/lib/admin/flag-catalog';
import { listFlags } from '@/services/admin.service';
import { setFlagAction } from '@/app/actions/admin';

export const metadata: Metadata = { title: 'Feature switches · Admin' };

type Flag = Awaited<ReturnType<typeof listFlags>>[number];

/**
 * /admin/feature-flags — PHASE-13 §33 to §36.
 *
 * Written for someone who has never seen the database. Every switch is shown
 * by its catalog name and description (`lib/admin/flag-catalog.ts`), never by
 * its key, and a switch that no code reads is listed apart, without a control,
 * because offering one that does nothing invites the belief that it did.
 *
 * The rules did not loosen: §36 still requires a reason and a typed
 * confirmation in BOTH directions, and `setFlagAction` still enforces them on
 * the server. Only the wording and the layout changed. The form sits behind a
 * native <details> so the page reads as a list of switches rather than a wall
 * of empty text boxes — and needs no client JavaScript to do it.
 */
export default async function AdminFlagsPage() {
  await requireAdmin();
  const flags = await listFlags();

  const rows = flags.map((flag) => ({ flag, info: flagInfo(flag.key) }));
  const live = rows.filter((r) => r.info.connected);
  const inactive = rows.filter((r) => !r.info.connected);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Feature switches"
        description="Turn parts of HelloPera on or off for everyone. These apply to all users at once, and every change is recorded."
      />

      {rows.length === 0 ? (
        <p className="hp-body text-text-muted">
          No switches were found. They are created when the database is set up.
        </p>
      ) : null}

      {FLAG_GROUP_ORDER.map((group) => {
        const inGroup = live.filter((r) => r.info.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} aria-labelledby={`group-${group}`} className="mb-8">
            <h2 id={`group-${group}`} className="hp-h3 mb-3 text-text">
              {FLAG_GROUP_TITLES[group]}
            </h2>
            <div className="space-y-3">
              {inGroup.map(({ flag, info }) => (
                <SwitchCard key={flag.key} flag={flag} info={info} />
              ))}
            </div>
          </section>
        );
      })}

      {inactive.length > 0 ? (
        <section aria-labelledby="group-inactive" className="mb-8">
          <h2 id="group-inactive" className="hp-h3 mb-1 text-text">
            Not connected yet
          </h2>
          <p className="hp-small mb-3 text-text-muted">
            These have no effect today, so there is nothing to turn on or off. They will
            appear above once they are connected.
          </p>
          <ul className="divide-y divide-border rounded-[var(--radius-hp)] border border-border bg-surface">
            {inactive.map(({ flag, info }) => (
              <li key={flag.key} className="px-4 py-3">
                <p className="hp-body font-medium text-text">{info.title}</p>
                <p className="hp-small text-text-muted">{info.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function SwitchCard({ flag, info }: { flag: Flag; info: FlagInfo }) {
  const nextIsOn = !flag.enabled;
  const verb = nextIsOn ? 'on' : 'off';

  // The state this switch is in is the risky one: a freeze that is active, or
  // cleanup that is running. Amber rather than green, and worded as a state.
  const caution = info.caution;
  const inRiskyState = caution ? (caution.when === 'on') === flag.enabled : false;
  // The change about to be made is the risky one.
  const nextIsRisky = caution ? (caution.when === 'on') === nextIsOn : false;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <h3 className="hp-body font-semibold text-text">{info.title}</h3>
        <Badge tone={inRiskyState ? 'warning' : flag.enabled ? 'success' : 'neutral'}>
          {flag.enabled ? 'On' : 'Off'}
        </Badge>
      </div>

      <p className="hp-small mt-1 text-text-muted">{info.description}</p>
      <p className="hp-small mt-2 text-text-muted">{lastChanged(flag)}</p>

      <details className="mt-3">
        <summary
          aria-label={`Turn ${verb} ${info.title}`}
          className={`${buttonClass(nextIsRisky ? 'danger' : 'secondary', 'sm')} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          Turn {verb}…
        </summary>

        <div className="mt-3 rounded-[var(--radius-hp)] border border-border bg-surface-muted p-4">
          {nextIsRisky && caution ? (
            <p role="note" className="hp-small mb-3 font-medium text-warning-text">
              Please read before continuing: {caution.text}
            </p>
          ) : null}

          <AdminForm
            action={setFlagAction}
            hidden={{ key: flag.key, enabled: String(nextIsOn) }}
            submitLabel={`Turn ${verb} ${info.title}`}
            reasonLabel="Why are you making this change?"
            confirmLabel="Type CONFIRM to continue"
            destructive
            submitVariant={nextIsRisky ? 'danger' : 'primary'}
          />
        </div>
      </details>
    </Card>
  );
}

/** "Last changed 20 Sep 2026", or a plain statement that nobody has changed it. */
function lastChanged(flag: Flag): string {
  if (!flag.updatedBy) return 'Never changed — this is the default setting.';
  const when = new Date(flag.updatedAt).toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `Last changed ${when}.`;
}
