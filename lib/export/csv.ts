/**
 * CSV serialisation — PHASE-14 §68.
 *
 * Pure and dependency-free, so the escaping rules are testable. They are the
 * whole substance of this module: a naive `values.join(',')` corrupts the
 * first description containing a comma, which in a finance export is roughly
 * the first row.
 */

/**
 * Escape one field per RFC 4180.
 *
 * A field is quoted when it contains a comma, a quote, or a newline; quotes
 * inside are doubled. Nothing else is transformed — an amount must arrive in
 * the spreadsheet exactly as it left the ledger.
 */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';

  const s = String(value);
  if (s === '') return '';

  // Leading =, +, - or @ make Excel and Sheets treat the cell as a formula.
  // Prefixing a single quote neutralises it. This matters because merchant
  // names and descriptions are user-supplied, and "=cmd|..." in a shared
  // export is a real attack, not a theoretical one.
  const risky = /^[=+\-@\t\r]/.test(s);
  const body = risky ? `'${s}` : s;

  if (/[",\n\r]/.test(body)) {
    return `"${body.replace(/"/g, '""')}"`;
  }
  return body;
}

export function toCsvRow(values: readonly unknown[]): string {
  return values.map(escapeCsvField).join(',');
}

/**
 * A complete CSV document.
 *
 * CRLF line endings, because RFC 4180 specifies them and Excel on Windows
 * still cares.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [toCsvRow(headers), ...rows.map(toCsvRow)].join('\r\n');
}
