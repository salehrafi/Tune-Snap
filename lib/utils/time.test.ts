import { describe, expect, it } from 'vitest';
import { formatSavedAt } from './time';

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);

describe('formatSavedAt', () => {
  it('shows "just now" for recent saves', () => {
    expect(formatSavedAt(NOW - 10_000, NOW)).toBe('just now');
  });

  it('shows minutes, hours and days', () => {
    expect(formatSavedAt(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatSavedAt(NOW - 3 * 60 * 60_000, NOW)).toBe('3h ago');
    expect(formatSavedAt(NOW - 2 * 24 * 60 * 60_000, NOW)).toBe('2d ago');
  });

  it('falls back to a calendar date for older items', () => {
    const label = formatSavedAt(NOW - 30 * 24 * 60 * 60_000, NOW);
    expect(label).not.toMatch(/ago/);
    expect(label.length).toBeGreaterThan(0);
  });

  it('never shows negative ages for clock skew', () => {
    expect(formatSavedAt(NOW + 60_000, NOW)).toBe('just now');
  });
});
