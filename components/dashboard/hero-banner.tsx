import { greetingFor, rotate } from '@/lib/analytics/series';
import { Terraces } from '@/components/brand/terraces';

/**
 * The greeting banner — rice terraces at first light, the showcase's hero.
 *
 * The illustration is an inline SVG rather than a raster: it is four gradient
 * bands and a sun, it scales to any width without a second asset, it costs
 * nothing to load, and it re-tints for dark mode from the same markup. It is
 * `aria-hidden` and sits behind the text, never carrying meaning.
 *
 * `greeting` and `line` are computed on the server from the user's own
 * timezone (lib/finance/obligation.todayInTimezone), so "Good morning" means
 * morning where the reader is, not where the container runs.
 */
export function HeroBanner({
  greeting,
  line,
  quote,
}: {
  greeting: string;
  line: string;
  quote: string;
}) {
  return (
    <section className="relative min-h-[9.5rem] overflow-hidden rounded-2xl border border-border bg-primary-wash">
      <Terraces />

      <div className="relative flex flex-col gap-4 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="max-w-lg">
          <h1 className="hp-h1 text-on-hero">{greeting}</h1>
          <p className="hp-body mt-1 font-medium text-on-hero-muted">{line}</p>
        </div>

        <figure className="max-w-xs rounded-xl bg-surface/85 p-4 backdrop-blur-sm">
          <blockquote className="hp-small italic leading-snug text-text">
            “{quote}”
          </blockquote>
          <span aria-hidden="true" className="mt-2.5 block h-0.5 w-8 rounded bg-gold" />
        </figure>
      </div>
    </section>
  );
}

export { greetingFor, rotate };

/** The rotating line under the greeting, picked by date. */
export const ENCOURAGEMENTS = [
  'Discipline today, more tomorrows later.',
  'Small steps. Big freedom.',
  'Every peso tracked is a peso understood.',
  'Clarity first. The rest follows.',
  'Progress beats perfection.',
  'You cannot steer what you cannot see.',
  'Today’s record is tomorrow’s answer.',
] as const;

export const QUOTES = [
  'A brighter tomorrow, one peso at a time.',
  'Real progress looks good on you.',
  'Track today. A brighter tomorrow.',
  'Organize. Understand. Grow.',
] as const;
