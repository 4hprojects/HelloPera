import { describe, expect, it } from 'vitest';
import { renderNotification, renderPushNotification } from '@/lib/notifications/copy';
import { NOTIFICATION_TYPES } from '@/lib/notifications/rules';

describe('notification copy — §47', () => {
  it('renders every type with no facts at all', () => {
    // A reminder whose metadata is missing must still read as a sentence,
    // not "Your undefined bill is due undefined".
    for (const type of NOTIFICATION_TYPES) {
      const { title, message } = renderNotification(type);
      expect(title, type).toBeTruthy();
      expect(message, type).toBeTruthy();
      expect(message, type).not.toMatch(/undefined|null|NaN/);
      expect(message, type).toMatch(/\.$/);
    }
  });

  it('avoids alarming or judgemental wording', () => {
    // §47 — no exclamation marks, no blame. A finance app that shouts about a
    // small bill trains people to ignore it.
    for (const type of NOTIFICATION_TYPES) {
      const { title, message } = renderNotification(type, {
        name: 'Converge',
        amount: '₱1,799.00',
        days: -5,
        date: '2026-09-20',
        count: 3,
      });
      expect(message, type).not.toContain('!');
      expect(title, type).not.toContain('!');
      expect(message.toLowerCase(), type).not.toMatch(
        /fail|urgent|immediately|warning|must pay|you owe|penalty/,
      );
    }
  });

  it('phrases day counts naturally on both sides of today', () => {
    expect(renderNotification('bill_due_soon', { days: 0 }).message).toContain('today');
    expect(renderNotification('bill_due_soon', { days: 1 }).message).toContain(
      'tomorrow',
    );
    expect(renderNotification('bill_due_soon', { days: 3 }).message).toContain(
      'in 3 days',
    );
    expect(renderNotification('bill_overdue', { days: -1 }).message).toContain(
      '1 day ago',
    );
    expect(renderNotification('bill_overdue', { days: -4 }).message).toContain(
      '4 days ago',
    );
  });

  it('includes the amount when known', () => {
    const { message } = renderNotification('bill_due_soon', {
      name: 'Converge',
      amount: '₱1,799.00',
      days: 3,
    });
    expect(message).toContain('Converge');
    expect(message).toContain('₱1,799.00');
  });

  it('describes missed income as missed, never overdue', () => {
    // Nobody owes expected income and nothing is late — Phase 06 §20's
    // distinction, which the copy has to keep.
    const { title, message } = renderNotification('expected_income_missed', {
      name: 'Stipend',
      date: '2026-09-15',
    });
    expect(`${title} ${message}`.toLowerCase()).not.toContain('overdue');
  });

  it('pluralises the OCR reminder', () => {
    expect(renderNotification('ocr_review_required', { count: 1 }).message).toContain(
      'An uploaded document',
    );
    expect(renderNotification('ocr_review_required', { count: 3 }).message).toContain(
      '3 uploaded documents',
    );
  });
});

describe('push copy — §14, §30', () => {
  it('never carries the amount onto a lock screen', () => {
    for (const type of NOTIFICATION_TYPES) {
      const { message } = renderPushNotification(type, {
        name: 'Converge',
        amount: '₱1,799.00',
        days: 3,
        date: '2026-09-20',
      });
      expect(message, type).not.toContain('1,799');
      expect(message, type).not.toContain('₱');
    }
  });

  it('still says enough to decide whether to open the app', () => {
    const { title, message } = renderPushNotification('bill_due_soon', {
      name: 'Converge',
      amount: '₱1,799.00',
      days: 3,
    });
    expect(title).toBe('Bill due soon');
    expect(message).toContain('Converge');
    expect(message).toContain('in 3 days');
  });
});
