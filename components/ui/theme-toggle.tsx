'use client';

import { useCallback, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'hp-theme';
const EVENT = 'hp-theme-change';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Subscribe to theme changes from this tab and from other tabs.
 * `storage` fires cross-tab; the custom event covers same-tab updates.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function getSnapshot(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : 'system';
  } catch {
    // Private browsing or blocked site data.
    return 'system';
  }
}

/** The server cannot know the stored choice, so it renders the neutral state. */
function getServerSnapshot(): Theme {
  return 'system';
}

/**
 * Three-state theme control — Phase 00 §11.
 *
 * `useSyncExternalStore` rather than an effect: localStorage is an external
 * store, and this is the pattern React provides for reconciling one with SSR
 * without a setState-in-effect cascade.
 *
 * "system" removes data-theme entirely so the prefers-color-scheme block in
 * globals.css takes over. An explicit choice stamps the attribute, which wins
 * in both directions.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const choose = useCallback((next: Theme) => {
    const root = document.documentElement;
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies to this page view; it just will not persist.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const options: Array<{ value: Theme; label: string }> = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ];

  return (
    <div
      role="group"
      aria-label="Colour theme"
      className="inline-flex rounded-full border border-border-strong p-0.5"
    >
      {options.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => choose(o.value)}
            className={
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-primary-fill text-on-primary'
                : 'text-text-muted hover:text-text')
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
