'use client';

import { useEffect, useState } from 'react';
import { ChevronUpIcon } from '@/components/icons';

/** Roughly one viewport: below this the top of the page is still close. */
const SHOW_AFTER_PX = 600;

/**
 * Back to top — public site only.
 *
 *  - Not rendered until the visitor has scrolled, so there is no invisible
 *    control sitting in the tab order.
 *  - Smooth scroll unless the visitor asked for reduced motion, which jumps
 *    instead (the same promise `globals.css` makes for every animation).
 *  - Focus moves to `#main` afterwards, so a keyboard or screen-reader user
 *    continues from the top rather than from a button at the bottom.
 *  - Sits above the consent banner while it is open: the banner publishes its
 *    height as `--hp-consent-h`.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    function check() {
      frame = 0;
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }
    // Deferred so no setState runs synchronously in the effect body.
    frame = requestAnimationFrame(check);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  function toTop(): void {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    document.getElementById('main')?.focus({ preventScroll: true });
  }

  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={toTop}
      style={{ bottom: 'calc(1rem + var(--hp-consent-h, 0px))' }}
      className="fixed right-4 z-30 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary-fill text-on-primary shadow-lg hover:opacity-90"
    >
      <ChevronUpIcon size={22} />
    </button>
  );
}
