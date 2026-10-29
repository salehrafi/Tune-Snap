import { normalizeWhitespace, stripDiacritics } from './text';

/**
 * Bracket groups that describe the upload rather than the song. They are
 * removed before duplicate detection so "(Official Video)" and
 * "(Official Audio)" are treated as the same recording.
 */
const DECORATION =
  /(?:\(|\[)[^)\]]*(?:official|lyric|audio|video|visuali[sz]er|4k|hd|hq|explicit|clean|mv|m\/v)[^)\]]*(?:\)|\])/gi;

/**
 * Normalize a value for wishlist identity.
 *
 * Keeps version words ("remix", "live", "acoustic", "sped up", ...) so two
 * different versions of a song never collapse into one item, while ignoring
 * case, accents, punctuation and upload decorations.
 */
export function normalizeForIdentity(value: string): string {
  return stripDiacritics(value)
    .replace(DECORATION, ' ')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:ft|featuring)\b\.?/g, 'feat')
    .replace(/['\u2018\u2019`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Duplicate key for a saved song. The same normalized title + artist is one
 * song regardless of platform; any version marker keeps it distinct.
 */
export function wishlistIdentity(title: string, artist: string | null): string {
  const normalizedTitle = normalizeForIdentity(title);
  const normalizedArtist = artist ? normalizeForIdentity(artist) : '';
  return `${normalizedTitle}|${normalizedArtist}`;
}

/** Trim user input for storage, returning `null` for blank artists. */
export function cleanArtist(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}
