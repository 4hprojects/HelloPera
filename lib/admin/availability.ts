/**
 * An admin read either produced data or it did not. A failed read must never be
 * rendered as zero activity: "0 failed jobs" during an outage is the most
 * reassuring wrong answer an operator can be shown.
 */
export type Availability<T> =
  { state: 'ok'; data: T } | { state: 'unavailable'; reference: string };

export function available<T>(data: T): Availability<T> {
  return { state: 'ok', data };
}

/** A short code an operator can quote; the same code is written to the logs. */
export function unavailable(reference: string): Availability<never> {
  return { state: 'unavailable', reference };
}

export function newReference(): string {
  return `adm-${Math.random().toString(36).slice(2, 8)}`;
}
