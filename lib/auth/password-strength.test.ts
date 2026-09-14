import { describe, expect, it } from 'vitest';
import {
  MAX_LENGTH,
  MIN_LENGTH,
  meetsMinimum,
  passwordStrength,
} from '@/lib/auth/password-strength';

describe('passwordStrength — length-keyed by design', () => {
  it('shows nothing for an empty field', () => {
    expect(passwordStrength('')).toEqual({ score: 0, label: '', percent: 0 });
  });

  it('counts down the characters still needed', () => {
    // More useful than "Weak": it says what to do about it.
    expect(passwordStrength('abc').label).toBe('5 more to go');
    expect(passwordStrength('abcdefg').label).toBe('1 more to go');
  });

  it('accepts at exactly the minimum the server enforces', () => {
    expect(passwordStrength('a'.repeat(MIN_LENGTH)).score).toBeGreaterThan(0);
    expect(meetsMinimum('a'.repeat(MIN_LENGTH))).toBe(true);
    expect(meetsMinimum('a'.repeat(MIN_LENGTH - 1))).toBe(false);
  });

  it('rates a long passphrase highly regardless of character classes', () => {
    // The case helloRun's meter gets wrong: this is genuinely strong and its
    // complexity-based scorer would call it weak, contradicting a server that
    // accepts it.
    const passphrase = 'correct horse battery staple';
    expect(passwordStrength(passphrase).score).toBe(4);
    expect(meetsMinimum(passphrase)).toBe(true);
  });

  it('never disagrees with the validator', () => {
    // A meter saying "too short" while the server accepts the value — or the
    // reverse — teaches people to ignore the meter.
    for (const length of [0, 1, 7, 8, 9, 30, 72, 73]) {
      const password = 'x'.repeat(length);
      const accepted = meetsMinimum(password);
      const rated = passwordStrength(password).score > 0;
      if (length >= MIN_LENGTH && length <= MAX_LENGTH) {
        expect(accepted && rated, String(length)).toBe(true);
      }
      if (length > 0 && length < MIN_LENGTH) {
        expect(accepted, String(length)).toBe(false);
        expect(rated, String(length)).toBe(false);
      }
    }
  });

  it('rejects past the bcrypt ceiling', () => {
    expect(meetsMinimum('x'.repeat(MAX_LENGTH))).toBe(true);
    expect(meetsMinimum('x'.repeat(MAX_LENGTH + 1))).toBe(false);
  });

  it('always carries a word, not only a colour (§4.1)', () => {
    // The meter must read in greyscale and to a screen reader.
    for (const length of [3, 8, 12, 16, 25]) {
      expect(passwordStrength('x'.repeat(length)).label.length).toBeGreaterThan(0);
    }
  });

  it('never decreases as the password gets longer', () => {
    // Non-decreasing, not strictly increasing: the scale caps at 4, so a
    // 20-character and a 40-character password both score 4. Adding a
    // character must never make the meter look worse.
    let previous = -1;
    for (let length = 0; length <= 60; length += 1) {
      const { score } = passwordStrength('x'.repeat(length));
      expect(score, `length ${length}`).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it('does rise across each band boundary', () => {
    const scores = [8, 12, 16, 20].map((n) => passwordStrength('x'.repeat(n)).score);
    expect(scores).toEqual([1, 2, 3, 4]);
  });
});
