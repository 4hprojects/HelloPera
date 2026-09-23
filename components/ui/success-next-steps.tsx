import Link from 'next/link';
import { buttonClass } from '@/components/ui/button';

type NextStep = {
  href: string;
  label: string;
};

export function SuccessNextSteps({
  title,
  description,
  primary,
  secondary = [],
}: {
  title: string;
  description: string;
  primary: NextStep;
  secondary?: NextStep[];
}) {
  return (
    <section
      role="status"
      className="mb-5 rounded-[var(--radius-hp)] border border-success bg-tint-success p-4"
    >
      <h2 className="hp-h3 text-success-text">{title}</h2>
      <p className="hp-body mt-1 max-w-2xl text-text">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={primary.href} className={buttonClass('primary', 'sm')}>
          {primary.label}
        </Link>
        {secondary.map((step) => (
          <Link key={step.href} href={step.href} className={buttonClass('ghost', 'sm')}>
            {step.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
