/**
 * Structured logging convention — Phase 00 §25.
 *
 * Never log: Supabase keys, auth tokens, passwords, or (from Phase 04)
 * document contents and OCR text. Redaction becomes mandatory in Phase 14;
 * the habit starts here.
 */

type Level = 'info' | 'warn' | 'error';
type Fields = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE = /^(.*(password|token|secret|key|authorization|cookie).*)$/i;

function redact(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = SENSITIVE.test(k) ? '[redacted]' : v;
  }
  return out;
}

function emit(level: Level, message: string, fields: Fields = {}): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...redact(fields),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
};
