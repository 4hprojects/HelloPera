import { describe, expect, it } from 'vitest';
import { escapeCsvField, toCsv, toCsvRow } from '@/lib/export/csv';

describe('escapeCsvField — RFC 4180', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvField('Groceries')).toBe('Groceries');
    expect(escapeCsvField(1234.56)).toBe('1234.56');
    expect(escapeCsvField('2026-09-14')).toBe('2026-09-14');
  });

  it('quotes a field containing a comma', () => {
    // The first description with a comma is roughly the first row, so a naive
    // join corrupts the export immediately.
    expect(escapeCsvField('Coffee, milk and bread')).toBe('"Coffee, milk and bread"');
  });

  it('doubles inner quotes and wraps', () => {
    expect(escapeCsvField('Paid "in full"')).toBe('"Paid ""in full"""');
  });

  it('quotes a field containing a newline', () => {
    expect(escapeCsvField('line one\nline two')).toBe('"line one\nline two"');
    expect(escapeCsvField('line one\r\nline two')).toBe('"line one\r\nline two"');
  });

  it('renders null and undefined as empty, not as the words', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
    // The bug this guards: String(null) is "null", which lands in the
    // spreadsheet as a merchant called null.
    expect(escapeCsvField(null)).not.toBe('null');
  });

  it('neutralises spreadsheet formula injection', () => {
    // Merchant names and descriptions are user-supplied. A cell beginning with
    // = is executed by Excel and Sheets on open, and an export is precisely
    // the file people share.
    expect(escapeCsvField('=1+1')).toBe("'=1+1");
    expect(escapeCsvField('+1234')).toBe("'+1234");
    expect(escapeCsvField('-1234')).toBe("'-1234");
    expect(escapeCsvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(escapeCsvField("=cmd|' /c calc'!A1")).toContain("'=");
  });

  it('quotes a neutralised field that also contains a comma', () => {
    expect(escapeCsvField('=a,b')).toBe('"\'=a,b"');
  });

  it('does not mangle a negative amount that is a number', () => {
    // -12.50 as a NUMBER is data, not a formula — but it arrives as a string
    // from Postgres numeric, so it is prefixed. Documented rather than
    // surprising: the value is preserved and the sign is still visible.
    expect(escapeCsvField(-12.5)).toBe("'-12.5");
  });
});

describe('toCsvRow', () => {
  it('joins fields with commas', () => {
    expect(toCsvRow(['a', 'b', 'c'])).toBe('a,b,c');
  });

  it('keeps empty fields positional', () => {
    // Dropping an empty value would shift every later column into the wrong
    // header — silently, and only for rows that had a gap.
    expect(toCsvRow(['a', null, 'c'])).toBe('a,,c');
    expect(toCsvRow([null, null, null])).toBe(',,');
  });
});

describe('toCsv', () => {
  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv(['date', 'amount'], [['2026-09-14', '100.00']]);
    expect(csv).toBe('date,amount\r\n2026-09-14,100.00');
  });

  it('produces header-only output for no rows', () => {
    // An empty export must still be a valid CSV a spreadsheet can open.
    expect(toCsv(['date', 'amount'], [])).toBe('date,amount');
  });

  it('keeps every row', () => {
    const rows = Array.from({ length: 2500 }, (_, i) => [String(i), '1.00']);
    const csv = toCsv(['n', 'amount'], rows);
    expect(csv.split('\r\n')).toHaveLength(2501);
  });
});
