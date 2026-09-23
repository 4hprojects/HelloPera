import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/export/csv';
import { log } from '@/lib/log';

/**
 * Data export — master plan §54a gate item, PHASE-14 §67, §68.
 *
 * ## The failure mode this module exists to avoid
 *
 * PostgREST caps a read at 1000 rows and returns **HTTP 200 with no error** —
 * just a `content-range: 0-999/4212` header. An unbounded select here would
 * hand someone a file that looks complete, opens cleanly, and silently omits
 * three quarters of their financial history. For a data-portability export
 * that is the worst possible bug: the user only discovers it later, somewhere
 * else, having already deleted the original.
 *
 * One RLS-scoped database RPC reads all sections in a single MVCC snapshot.
 * This avoids both REST row caps and offset drift during concurrent writes.
 */

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

type Row = Record<string, unknown>;

/**
 * What goes in the export — PHASE-14 §67.
 *
 * Document METADATA only, never file contents: those are the user's originals
 * and are downloaded from the documents screen. Putting them in a JSON blob
 * would produce a file too large to open for anyone who has used the product.
 */
const TABLES: Array<{ key: string; table: string; columns: string; orderBy: string }> = [
  {
    key: 'accounts',
    table: 'accounts',
    columns:
      'id, name, type, nature, currency_code, opening_balance, current_balance, institution_name, is_active, is_archived, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'categories',
    table: 'categories',
    columns: 'id, name, type, is_system, is_active, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'transactions',
    table: 'transactions',
    columns:
      'id, type, direction, amount, currency_code, transaction_date, source_account_id, destination_account_id, category_id, merchant_name, description, notes, status, void_reason, created_at',
    orderBy: 'transaction_date',
  },
  {
    key: 'bills',
    table: 'bills',
    columns:
      'id, provider_name, description, category_id, amount, currency_code, due_date, status, notes, created_at',
    orderBy: 'due_date',
  },
  {
    key: 'receivables',
    table: 'receivables',
    columns:
      'id, party_name, description, amount, currency_code, due_date, status, notes, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'expected_income',
    table: 'expected_income',
    columns:
      'id, source_name, description, category_id, amount, currency_code, expected_date, status, notes, created_at',
    orderBy: 'expected_date',
  },
  {
    key: 'recurring_rules',
    table: 'recurring_rules',
    columns:
      'id, rule_type, name, description, amount, currency_code, frequency, interval_count, day_of_month, day_of_week, start_date, end_date, is_active, is_paused, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'documents',
    table: 'documents',
    columns:
      'id, document_type, original_filename, original_mime_type, original_size_bytes, processing_status, retention_status, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'bill_payments',
    table: 'bill_payments',
    columns: 'id, bill_id, transaction_id, amount_applied, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'receivable_payments',
    table: 'receivable_payments',
    columns: 'id, receivable_id, transaction_id, amount_applied, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'expected_income_receipts',
    table: 'expected_income_receipts',
    columns: 'id, expected_income_id, transaction_id, amount_applied, created_at',
    orderBy: 'created_at',
  },
  {
    key: 'expected_events',
    table: 'expected_events',
    columns:
      'id, recurring_rule_id, event_type, name, amount, currency_code, scheduled_date, status, account_id, category_id, actual_transaction_id, include_in_forecast, detached_from_rule, source_entity_type, source_entity_id, created_at',
    orderBy: 'created_at',
  },
];

export type ExportBundle = Record<string, Row[]>;

/** Everything, as structured data. */
export async function buildExport(): Promise<ExportBundle> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('export_financial_snapshot');
  if (error || !data)
    throw new ExportError('Your export could not be completed. Please try again.');
  const bundle = data as ExportBundle;
  const total = Object.values(bundle).reduce((n, rows) => n + rows.length, 0);
  log.info('export built', { rows: total });

  return bundle;
}

/** §68 — JSON. */
export function toJsonExport(bundle: ExportBundle): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      format_version: 2,
      note: 'Amounts are exact decimal strings, as stored. Document files are not included; download those from the Documents screen.',
      data: bundle,
    },
    null,
    2,
  );
}

/**
 * §68 — CSV.
 *
 * One CSV cannot hold eight differently-shaped tables, so each becomes its own
 * section with its own header, separated by a blank line and a section marker.
 * A spreadsheet opens it; a human reads it; and no column means two things in
 * different rows, which is what a single flattened sheet would produce.
 */
export function toCsvExport(bundle: ExportBundle): string {
  const sections: string[] = [];

  for (const [key, rows] of Object.entries(bundle)) {
    const headers =
      rows.length > 0
        ? Object.keys(rows[0]!)
        : (TABLES.find((t) => t.key === key)?.columns ?? '')
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean);

    sections.push(`# ${key}`);
    sections.push(
      toCsv(
        headers,
        rows.map((r) => headers.map((h) => r[h])),
      ),
    );
    sections.push('');
  }

  return sections.join('\r\n');
}
