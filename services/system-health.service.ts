import 'server-only';

import sharp from 'sharp';
import { isSchedulerConfigured } from '@/lib/env';
import { log } from '@/lib/log';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET } from '@/services/storage.service';

export type SystemHealthStatus = 'operational' | 'unavailable' | 'not_configured';

export type SystemHealthCheck = {
  key: 'database' | 'storage' | 'images' | 'scheduler' | 'ai_ocr';
  label: string;
  status: SystemHealthStatus;
  detail: string;
  durationMs: number | null;
};

const TIMEOUT_MS = 3000;

async function activeCheck(
  key: SystemHealthCheck['key'],
  label: string,
  detail: string,
  task: () => Promise<void>,
): Promise<SystemHealthCheck> {
  const started = performance.now();
  try {
    await Promise.race([
      task(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS),
      ),
    ]);
    return {
      key,
      label,
      status: 'operational',
      detail,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    log.error('system health check failed', {
      component: key,
      error_type: error instanceof Error ? error.name : 'UnknownError',
    });
    return {
      key,
      label,
      status: 'unavailable',
      detail: 'Active check failed',
      durationMs: Math.round(performance.now() - started),
    };
  }
}

function configurationCheck(
  key: 'scheduler' | 'ai_ocr',
  label: string,
  configured: boolean,
  configuredDetail: string,
  missingDetail: string,
): SystemHealthCheck {
  return {
    key,
    label,
    status: configured ? 'operational' : 'not_configured',
    detail: configured ? configuredDetail : missingDetail,
    durationMs: null,
  };
}

/** Active infrastructure checks plus non-invasive provider configuration checks. */
export async function getSystemHealth(): Promise<SystemHealthCheck[]> {
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    admin = createAdminClient();
  } catch (error) {
    log.error('system health client unavailable', {
      error_type: error instanceof Error ? error.name : 'UnknownError',
    });
  }

  const database = activeCheck(
    'database',
    'Database',
    'Supabase query succeeded',
    async () => {
      if (!admin) throw new Error('client unavailable');
      const { error } = await admin
        .from('feature_flags')
        .select('key', { count: 'exact', head: true });
      if (error) throw new Error(error.code);
    },
  );

  const storage = activeCheck(
    'storage',
    'Storage',
    'Document bucket is reachable',
    async () => {
      if (!admin) throw new Error('client unavailable');
      const { error } = await admin.storage.from(BUCKET).list('', { limit: 1 });
      if (error) throw new Error('storage unavailable');
    },
  );

  const images = activeCheck(
    'images',
    'Image processing',
    'Sharp generated a WebP image',
    async () => {
      await sharp({
        create: { width: 1, height: 1, channels: 3, background: '#ffffff' },
      })
        .webp({ quality: 50 })
        .toBuffer();
    },
  );

  const [databaseResult, storageResult, imageResult] = await Promise.all([
    database,
    storage,
    images,
  ]);

  const providerConfigured = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );

  return [
    databaseResult,
    storageResult,
    imageResult,
    configurationCheck(
      'scheduler',
      'Scheduler auth',
      isSchedulerConfigured(),
      'Scheduler secret is configured',
      'SCHEDULER_SECRET is missing',
    ),
    configurationCheck(
      'ai_ocr',
      'AI and OCR',
      providerConfigured,
      'Provider credentials are configured',
      'Provider credentials are missing',
    ),
  ];
}
