import { describe, expect, it } from 'vitest';
import {
  normalizeForMatch,
  normalizeWhitespace,
  stripDiacritics,
  toMatchTokens,
} from './text';

describe('normalizeWhitespace', () => {
  it('collapses whitespace and removes zero-width characters', () => {
    expect(normalizeWhitespace('  Blinding\u200B   Lights\n')).toBe('Blinding Lights');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeWhitespace(' \n\t ')).toBe('');
  });
});

describe('stripDiacritics', () => {
  it('removes combining marks', () => {
    expect(stripDiacritics('Beyoncé')).toBe('Beyonce');
    expect(stripDiacritics('Sigur Rós')).toBe('Sigur Ros');
  });
});

describe('normalizeForMatch', () => {
  it('lowercases, removes punctuation, and normalizes accents', () => {
    expect(normalizeForMatch('  Beyoncé — Halo!  ')).toBe('beyonce halo');
  });

  it('normalizes ampersands', () => {
    expect(normalizeForMatch('Simon & Garfunkel')).toBe('simon and garfunkel');
  });

  it('keeps version words so remixes remain distinguishable', () => {
    expect(normalizeForMatch('Song (Remix)')).toContain('remix');
    expect(normalizeForMatch('Song (Live)')).toContain('live');
  });
});

describe('toMatchTokens', () => {
  it('drops stop words and short filler', () => {
    expect(toMatchTokens('The Weeknd')).toEqual(['weeknd']);
    expect(toMatchTokens('Blinding Lights')).toEqual(['blinding', 'lights']);
  });

  it('returns an empty list for punctuation-only input', () => {
    expect(toMatchTokens('— !')).toEqual([]);
  });
});
