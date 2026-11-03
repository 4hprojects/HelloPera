import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
test('public pages are navigable, honest about availability, and fit the viewport', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const violations: string[] = [];
  await page.exposeFunction('captureCspViolation', (directive: string) =>
    violations.push(directive),
  );
  await page.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (event) => {
      void (
        window as unknown as { captureCspViolation: (value: string) => Promise<void> }
      ).captureCspViolation(event.violatedDirective);
    }),
  );
  for (const route of [
    '/',
    '/features',
    '/pricing',
    '/faq',
    '/privacy',
    '/contact',
    '/login',
    '/register',
  ]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toBeTruthy();
    await expect(page.locator('h1')).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      `Accessibility on ${route}`,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto('/features');
  await expect(page.getByText('Coming later', { exact: true })).toBeVisible();
  await page.screenshot({
    path: `test-results/features-${page.viewportSize()?.width}.png`,
    fullPage: true,
  });
  expect(violations).toEqual([]);
});
test('password form has labeled fields and keyboard access', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('person@example.test');
  await page.getByLabel('Password', { exact: true }).focus();
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test('dark theme remains readable and navigation targets are touch-sized', async ({
  page,
}) => {
  await page.goto('/features');
  // On a phone the theme toggle is in the footer, under the consent banner.
  // A fresh context always gets the banner, after hydration, so wait for it
  // and answer it as a visitor would.
  await page.getByRole('button', { name: 'Only what is needed' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  const targets = page.locator('header nav a:visible, header button:visible');
  for (const target of await targets.all())
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test('header and consent banner stay compact at every width', async ({ page }) => {
  // HP-024: at 375 and 768px the nav wrapped, stranding one link on a line of
  // its own, and the consent banner covered a fifth of a phone screen.
  await page.goto('/features');
  const header = await page.locator('header:has(nav[aria-label="Site"])').boundingBox();
  expect(header?.height ?? 0).toBeLessThanOrEqual(130);
  const tops = await page
    .locator('header nav[aria-label="Site"] a')
    .evaluateAll((links) => links.map((a) => Math.round(a.getBoundingClientRect().top)));
  expect(new Set(tops).size, 'site nav fits on one row').toBe(1);
  const banner = page.getByRole('region', { name: 'Cookie choices' });
  await expect(banner).toBeVisible();
  const box = await banner.boundingBox();
  const viewport = page.viewportSize()?.height ?? 800;
  expect(box?.height ?? 0).toBeLessThanOrEqual(viewport * 0.16);
  await expect(page.getByRole('group', { name: 'Colour theme' })).toBeVisible();
});

test('manifest, sitemap and robots describe the public site', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  const body = (await manifest.json()) as {
    name?: string;
    start_url?: string;
    icons?: Array<{ src: string; sizes?: string }>;
  };
  expect(body.name).toBeTruthy();
  expect(body.start_url).toBeTruthy();
  expect(body.icons?.some((i) => i.sizes === '512x512')).toBe(true);
  for (const icon of body.icons ?? []) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }

  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const path of ['/features', '/pricing', '/privacy']) {
    expect(sitemap, path).toContain(path);
  }
  for (const path of ['/dashboard', '/admin', '/settings']) {
    expect(sitemap, path).not.toContain(path);
  }

  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Sitemap:/i);
});
