import { greetingFor, rotate } from '@/lib/analytics/series';

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

/** Layered mountain bands. Decorative; carries no information. */
function Terraces() {
  return (
    <svg
      viewBox="0 0 800 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <linearGradient id="hp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--hp-tint-primary)" />
          <stop offset="100%" stopColor="var(--hp-primary-wash)" />
        </linearGradient>
      </defs>
      <rect width="800" height="220" fill="url(#hp-sky)" />
      <circle cx="612" cy="74" r="30" fill="var(--hp-gold)" opacity="0.30" />

      {/* Four ridges, each darker and lower than the one behind it — the
          only depth cue a flat illustration gets. */}
      <path
        d="M0 118 L118 74 L210 112 L318 58 L436 116 L544 72 L658 118 L800 80 L800 220 L0 220 Z"
        fill="var(--hp-hero-band)"
        opacity="0.18"
      />
      <path
        d="M0 150 L110 108 L226 148 L352 100 L470 152 L600 110 L720 152 L800 126 L800 220 L0 220 Z"
        fill="var(--hp-hero-band)"
        opacity="0.30"
      />
      <path
        d="M0 182 L140 152 L300 186 L460 150 L620 190 L800 158 L800 220 L0 220 Z"
        fill="var(--hp-hero-band)"
        opacity="0.44"
      />
      {/* Terraced foreground: stepped contours, the motif the showcase uses. */}
      <path
        d="M0 208 L200 196 L420 210 L640 194 L800 204 L800 220 L0 220 Z"
        fill="var(--hp-hero-band)"
        opacity="0.60"
      />
      {[196, 204, 212].map((y) => (
        <path
          key={y}
          d={`M0 ${y + 8} C 180 ${y - 4}, 420 ${y + 12}, 800 ${y - 2}`}
          fill="none"
          stroke="var(--hp-on-hero)"
          strokeWidth="1"
          opacity="0.35"
        />
      ))}
    </svg>
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
