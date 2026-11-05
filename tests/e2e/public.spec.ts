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

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`back to top appears after scrolling and returns to the top (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    // The home page is the longest at every viewport; /features fits on one
    // desktop screen, where the button correctly never appears.
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Back to top' });
    await expect(button).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(button).toBeVisible();

    // Must not sit underneath the consent banner while it is open.
    const banner = page.getByRole('region', { name: 'Cookie choices' });
    if (await banner.isVisible()) {
      const b = (await button.boundingBox())!;
      const c = (await banner.boundingBox())!;
      expect(b.y + b.height).toBeLessThanOrEqual(c.y);
    }

    await button.click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.locator('#main')).toBeFocused();
    await expect(button).toHaveCount(0);
  });
}
