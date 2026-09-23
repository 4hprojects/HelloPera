import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260921000100_provider_features_default_off.sql',
  'utf8',
);
const ocr = readFileSync('services/ocr.service.ts', 'utf8');
const push = readFileSync('services/push-delivery.service.ts', 'utf8');

describe('provider-backed feature safety', () => {
  it('ships OCR and push disabled', () => {
    expect(migration).toMatch(/set enabled = false/);
    expect(migration).toContain("'ocr_enabled'");
    expect(migration).toContain("'push_enabled'");
  });

  it('checks each flag before calling its provider', () => {
    expect(ocr).toContain("isFlagEnabled('ocr_enabled')");
    expect(push).toContain("isFlagEnabled('push_enabled')");
  });
});
