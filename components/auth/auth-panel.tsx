import { LeafMark } from '@/components/brand/motifs';
import { BRAND } from '@/lib/constants/brand';

/**
 * The marketing half of the auth split-screen.
 *
 * Structure follows helloRun's signup — logo, headline, subtitle, benefit
 * bullets, and a link to the opposite action — but the identity is HelloPera's
 * own: Deep Ink and jade with the showcase's leaf motif, not helloRun's
 * blue-to-teal gradient.
 *
 * ## On mobile it shrinks rather than disappears
 *
 * helloRun sets `.brand-features { display: none }` below 768px, so its entire
 * value proposition vanishes on the devices most people sign up from. That is
 * a concession to fitting the form above the fold, not a decision worth
 * copying. Here the panel becomes a compact header: logo, headline and one
 * line of reassurance survive, and only the bullet list is dropped.
 *
 * ## Contrast
 *
 * The ground is `--hp-nav` #132238, the same Deep Ink as the app rail, so the
 * signed-out and signed-in surfaces read as one product. Measured on it:
 * `--hp-nav-text` #e8eef4 is 13.68:1, `--hp-nav-muted` #9fb0c2 is 7.20:1, and
 * `--hp-primary-soft` #45c2a5 is 6.44:1 — all clear AA comfortably.
 */
const BENEFITS = [
  'Cash, bank, GCash and Maya in one place',
  'Bills and receivables, with partial payments',
  'Photograph a receipt — you confirm what it says',
  'See what is due before it catches you',
];

export function AuthPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="relative overflow-hidden bg-nav p-6 sm:p-8 lg:w-[42%] lg:shrink-0">
      {/*
        Decorative leaves, bled off the corner. `aria-hidden` via LeafMark —
        ornament, never information (DESIGN-SYSTEM §2).
      */}
      <LeafMark
        size={180}
        className="pointer-events-none absolute -right-10 -top-10 opacity-[0.07]"
      />
      <LeafMark
        size={120}
        className="pointer-events-none absolute -bottom-8 -left-6 rotate-180 opacity-[0.05]"
      />

      {/*
        No logo here. The site header above already carries the mark, and two
        of them roughly a hundred pixels apart reads as a mistake rather than
        as branding.
      */}
      <div className="relative">
        <h1 className="hp-h1 text-nav-text">{title}</h1>
        <p className="hp-body mt-2 text-nav-muted">{subtitle}</p>

        {/* Dropped below `lg` — the panel becomes a header, not a wall. */}
        <ul className="mt-7 hidden space-y-3 lg:block">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5">
              <LeafMark size={16} className="mt-0.5" />
              <span className="hp-body text-nav-text">{benefit}</span>
            </li>
          ))}
        </ul>

        <p className="hp-small mt-8 hidden border-t border-nav-border pt-5 italic text-nav-muted lg:block">
          {BRAND.motto}
        </p>
      </div>
    </section>
  );
}
