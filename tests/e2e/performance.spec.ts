import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

test('representative private-route performance', async ({ page }, info) => {
  test.skip(
    !process.env.HELLOPERA_PERF_PROFILE,
    'Run the explicit performance command against isolated staging.',
  );
  test.setTimeout(15 * 60_000);
  const large = process.env.HELLOPERA_PERF_PROFILE === 'large';
  const sizes = {
    accounts: large ? 20 : 8,
    transactions: large ? 20_000 : 5_000,
    obligations: large ? 500 : 100,
    documents: large ? 2000 : 500,
    notifications: large ? 5000 : 1000,
  };
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const email = `perf-${randomUUID()}@example.test`,
    password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  async function insert(table: string, rows: Record<string, unknown>[]) {
    for (let offset = 0; offset < rows.length; offset += 500) {
      const { error } = await admin.from(table).insert(rows.slice(offset, offset + 500));
      if (error) throw new Error(`Performance fixture failed: ${table} (${error.code})`);
    }
  }
  try {
    const ids = Array.from({ length: sizes.accounts }, () => randomUUID());
    await insert(
      'accounts',
      ids.map((id) => ({
        id,
        user_id: userId,
        name: 'Fixture wallet',
        type: 'cash',
        nature: 'asset',
        currency_code: 'PHP',
      })),
    );
    const today = new Date().toISOString().slice(0, 10);
    await insert(
      'transactions',
      Array.from({ length: sizes.transactions }, (_, i) => ({
        user_id: userId,
        type: 'income',
        amount: '1.00',
        currency_code: 'PHP',
        transaction_date: today,
        destination_account_id: ids[i % ids.length],
        status: 'confirmed',
      })),
    );
    for (const id of ids) {
      const { error } = await admin.rpc('recalculate_account_balance', {
        p_account_id: id,
      });
      if (error) throw error;
    }
    await insert(
      'bills',
      Array.from({ length: sizes.obligations }, () => ({
        user_id: userId,
        provider_name: 'Fixture bill',
        amount: '1.00',
        currency_code: 'PHP',
        due_date: today,
      })),
    );
    await insert(
      'documents',
      Array.from({ length: sizes.documents }, () => ({
        user_id: userId,
        document_type: 'receipt',
        original_filename: 'fixture.pdf',
        processing_status: 'ready',
        retention_status: 'original_retained',
      })),
    );
    await insert(
      'notifications',
      Array.from({ length: sizes.notifications }, () => ({
        user_id: userId,
        type: 'bill_due_today',
        channel: 'in_app',
        dedupe_key: randomUUID(),
        metadata: { provider_name: 'Fixture bill' },
      })),
    );
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('**/dashboard');
    const results = [];
    for (const route of [
      '/dashboard',
      '/analytics',
      '/transactions',
      '/transactions?page=20',
      '/documents',
      '/notifications',
      '/notifications?page=20',
    ]) {
      const samples = [];
      for (let i = 0; i < 31; i++) {
        const started = performance.now();
        const response = await page.goto(route);
        await page.locator('h1').waitFor();
        expect(response?.status()).toBe(200);
        if (i > 0) samples.push(performance.now() - started);
      }
      samples.sort((a, b) => a - b);
      results.push({
        route,
        p50_ms: Math.round(samples[14]!),
        p95_ms: Math.round(samples[28]!),
        samples: 30,
      });
    }
    await info.attach('route-performance', {
      body: JSON.stringify(
        {
          profile: process.env.HELLOPERA_PERF_PROFILE,
          sizes,
          kind: 'warm browser navigation; correlate service timing logs separately',
          results,
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error('Performance fixture cleanup failed');
  }
});
