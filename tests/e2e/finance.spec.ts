import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// This suite creates and destroys fixtures only in the explicitly selected test project.
// Run via npm run test:e2e:staging, which refuses missing configuration.
test('account → income → bill → partial payment → void → archive', async ({ page }) => {
  test.setTimeout(180_000);
  test.skip(
    process.env.HELLOPERA_E2E_STAGING !== '1',
    'Staging release gate runs this separately with an isolated project.',
  );
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const email = `launch-${randomUUID()}@example.test`;
  const password = `Test-${randomUUID()}-a`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error('Could not create isolated browser fixture');
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard');
    await page.goto('/accounts/new');
    await page.getByLabel('Account name').fill('Launch wallet');
    await page.getByRole('button', { name: /add account|create account/i }).click();
    await page.waitForURL('**/accounts?*');
    await page.goto('/transactions/new?type=income');
    await page.getByLabel('Amount', { exact: true }).fill('1000');
    await page
      .locator('[name="destinationAccountId"]')
      .selectOption({ label: 'Launch wallet (PHP)' });
    await page.getByRole('button', { name: /record|save|add/i }).click();
    await page.waitForURL('**/transactions?*');
    await page.goto('/bills/new');
    await page.locator('[name="providerName"]').fill('Launch bill');
    await page.getByLabel('Amount due', { exact: true }).fill('100');
    await page.locator('[name="dueDate"]').fill('2026-09-23');
    await page.getByRole('button', { name: /add bill|create bill/i }).click();
    await page.waitForURL('**/bills?*');
    await page.getByRole('link', { name: 'Record payment' }).click();
    await page.getByLabel('Amount paid or received').fill('40');
    await page
      .getByLabel('Account', { exact: true })
      .selectOption({ label: 'Launch wallet' });
    await page.getByRole('button', { name: 'Record payment', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Payment recorded');
    await expect(page.getByText('Remaining:')).toContainText('60.00');
    await page.goto('/transactions');
    await page.getByText('Correct this transaction', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirm void' }).first().click();
    await expect(page.getByText('Voided', { exact: true }).first()).toBeVisible();
    await page.goto('/accounts');
    await page.getByText('Archive account', { exact: true }).click();
    await page.getByRole('button', { name: 'Confirm archive' }).click();
    await expect(
      page.getByText('Launch wallet (archived)', { exact: true }),
    ).toBeVisible();
    await page.goto('/documents');
    for (const size of [2 * 1024 * 1024, 8 * 1024 * 1024]) {
      const buffer = Buffer.alloc(size, 32);
      buffer.write('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF');
      await page
        .getByLabel('Choose a file')
        .setInputFiles({
          name: `fixture-${size}.pdf`,
          mimeType: 'application/pdf',
          buffer,
        });
      await page.getByRole('button', { name: 'Upload', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Uploaded');
      await page.reload();
    }
    await page.goto('/settings/delete');
    await page.getByLabel('Your password').fill(password);
    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await page.getByRole('button', { name: 'Delete my account permanently' }).click();
    await page.waitForURL('**/?deleted=1');
    const deleted = await admin.auth.admin.getUserById(data.user.id);
    expect(deleted.error).toBeTruthy();
  } finally {
    const { data: documents, error: filesError } = await admin
      .from('documents')
      .select('original_path, display_path, thumbnail_path')
      .eq('user_id', data.user.id);
    if (filesError) throw new Error('Could not enumerate browser fixture files');
    const paths = (documents ?? [])
      .flatMap((d) => [d.original_path, d.display_path, d.thumbnail_path])
      .filter((path): path is string => Boolean(path));
    if (paths.length) {
      const { error } = await admin.storage.from('hello-pera-documents').remove(paths);
      if (error) throw new Error('Browser fixture file cleanup failed');
    }
    const { error: cleanupError } = await admin.auth.admin.deleteUser(data.user.id);
    if (cleanupError && cleanupError.code !== 'user_not_found')
      throw new Error('Browser fixture cleanup failed');
  }
});
