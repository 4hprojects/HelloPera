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
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  const targets = page.locator('header nav a, header button');
  for (const target of await targets.all())
    expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
