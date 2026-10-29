import { describe, expect, it } from 'vitest';
import { cleanArtist, normalizeForIdentity, wishlistIdentity } from './identity';

describe('wishlistIdentity', () => {
  it('treats case, accents, spacing and punctuation as the same song', () => {
    expect(wishlistIdentity('  blinding   LIGHTS! ', 'the weeknd')).toBe(
      wishlistIdentity('Blinding Lights', 'The Weeknd'),
    );
    expect(wishlistIdentity('Beyoncé', 'Beyoncé')).toBe(wishlistIdentity('Beyonce', 'BEYONCE'));
  });

  it('ignores upload decorations that describe the same recording', () => {
    expect(wishlistIdentity('Blinding Lights (Official Video)', 'The Weeknd')).toBe(
      wishlistIdentity('Blinding Lights (Official Audio)', 'The Weeknd'),
    );
    expect(wishlistIdentity('Blinding Lights [Lyrics]', 'The Weeknd')).toBe(
      wishlistIdentity('Blinding Lights', 'The Weeknd'),
    );
  });

  it('keeps different versions separate', () => {
    const original = wishlistIdentity('Blinding Lights', 'The Weeknd');
    expect(wishlistIdentity('Blinding Lights (Remix)', 'The Weeknd')).not.toBe(original);
    expect(wishlistIdentity('Blinding Lights - Live', 'The Weeknd')).not.toBe(original);
    expect(wishlistIdentity('Blinding Lights (Acoustic)', 'The Weeknd')).not.toBe(original);
    expect(wishlistIdentity('Blinding Lights (Sped Up)', 'The Weeknd')).not.toBe(original);
  });

  it('normalizes featured-artist spellings without merging different artists', () => {
    expect(wishlistIdentity('Song (ft. X)', 'A')).toBe(wishlistIdentity('Song (feat. X)', 'A'));
    expect(wishlistIdentity('Song (feat. X)', 'A')).not.toBe(
      wishlistIdentity('Song (feat. Y)', 'A'),
    );
  });

  it('does not merge a song with and without an artist', () => {
    expect(wishlistIdentity('Blinding Lights', null)).not.toBe(
      wishlistIdentity('Blinding Lights', 'The Weeknd'),
    );
  });
});

describe('normalizeForIdentity', () => {
  it('returns an empty string for empty input', () => {
    expect(normalizeForIdentity('   ')).toBe('');
  });
});

describe('cleanArtist', () => {
  it('trims and collapses artist input', () => {
    expect(cleanArtist('  The   Weeknd ')).toBe('The Weeknd');
  });

  it('returns null for blank or non-string values', () => {
    expect(cleanArtist('')).toBeNull();
    expect(cleanArtist('   ')).toBeNull();
    expect(cleanArtist(undefined)).toBeNull();
  });
});
