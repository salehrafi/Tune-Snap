const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
const WHITESPACE = /\s+/g;

/** Collapse all whitespace, drop invisible characters, and trim. */
export function normalizeWhitespace(value: string): string {
  return value.replace(ZERO_WIDTH, '').replace(WHITESPACE, ' ').trim();
}

/** Remove combining marks so "Beyoncé" and "Beyonce" compare equal. */
export function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{M}+/gu, '');
}

/**
 * Lowercase, accent-free, punctuation-free form used by search ranking and
 * wishlist filtering. Deliberately keeps words like "remix" so versions stay
 * distinguishable.
 */
export function normalizeForMatch(value: string): string {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'to', 'in', 'on', 'for', 'with', 'by']);

export function toMatchTokens(value: string): string[] {
  return normalizeForMatch(value)
    .split(' ')
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}
