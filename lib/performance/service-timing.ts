import { log } from '@/lib/log';

type MetricValue = string | number | boolean | null | undefined;
type MetricFields = Record<string, MetricValue>;

type TimingOptions<T> = {
  fields?: MetricFields;
  resultFields?: (result: T) => MetricFields;
};

/** Record service latency without logging user-entered or financial data. */
export async function withServiceTiming<T>(
  operation: string,
  task: () => Promise<T>,
  options: TimingOptions<T> = {},
): Promise<T> {
  const started = performance.now();

  try {
    const result = await task();
    log.info('service timing', {
      operation,
      status: 'ok',
      duration_ms: Math.round(performance.now() - started),
      ...options.fields,
      ...options.resultFields?.(result),
    });
    return result;
  } catch (error) {
    log.warn('service timing', {
      operation,
      status: 'error',
      duration_ms: Math.round(performance.now() - started),
      ...options.fields,
      error_type: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
