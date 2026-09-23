import { describe, expect, it } from 'vitest';
import { mobileMoreNav, mobileNav } from '@/lib/constants/navigation';

describe('mobile navigation', () => {
  it('keeps four persistent destinations plus the More control', () => {
    expect(mobileNav).toHaveLength(4);
  });

  it('keeps every mobile destination unique', () => {
    const hrefs = [...mobileNav, ...mobileMoreNav].map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('keeps lower-frequency money workflows reachable from More', () => {
    const hrefs = mobileMoreNav.map((item) => item.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/accounts',
        '/bills',
        '/receivables',
        '/expected-income',
        '/recurring',
        '/forecast',
        '/notifications',
        '/settings',
      ]),
    );
  });
});
