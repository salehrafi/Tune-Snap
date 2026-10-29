import { describe, expect, it } from 'vitest';
import { parseSongText } from './parse';

describe('parseSongText', () => {
  it('parses the music-note "title · artist" format', () => {
    expect(parseSongText('♫ Blinding Lights · The Weeknd')).toEqual({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      confidence: 'high',
      originalAudio: false,
    });
  });

  it('strips a leading label prefix', () => {
    expect(parseSongText('Audio: Levitating · Dua Lipa')).toMatchObject({
      title: 'Levitating',
      artist: 'Dua Lipa',
      confidence: 'high',
    });
  });

  it('parses "title by artist" only when explicitly allowed', () => {
    expect(parseSongText('Blinding Lights by The Weeknd', { allowByPattern: true })).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      confidence: 'medium',
    });

    expect(parseSongText('Blinding Lights by The Weeknd')).toMatchObject({
      title: 'Blinding Lights by The Weeknd',
      artist: null,
      confidence: 'low',
    });
  });

  it('does not split real titles that contain "by"', () => {
    expect(parseSongText('Stand by Me')).toMatchObject({
      title: 'Stand by Me',
      artist: null,
    });
  });

  it('recognizes original audio labels', () => {
    expect(parseSongText('Original audio')?.originalAudio).toBe(true);
    expect(parseSongText('Original audio · Some Creator')?.originalAudio).toBe(true);
  });

  it('rejects accessibility/UI noise', () => {
    expect(parseSongText('Audio is muted')).toBeNull();
    expect(parseSongText('Mute')).toBeNull();
    expect(parseSongText('Play')).toBeNull();
    expect(parseSongText('Open music page')).toBeNull();
    expect(parseSongText('1,234 views')).toBeNull();
  });

  it('rejects empty, glyph-only and numeric labels', () => {
    expect(parseSongText('')).toBeNull();
    expect(parseSongText('   ')).toBeNull();
    expect(parseSongText('♫')).toBeNull();
    expect(parseSongText('12345')).toBeNull();
    expect(parseSongText(null)).toBeNull();
  });

  it('returns a low-confidence title when no separator is present', () => {
    expect(parseSongText('♪ Blinding Lights')).toEqual({
      title: 'Blinding Lights',
      artist: null,
      confidence: 'low',
      originalAudio: false,
    });
  });

  it('parses dash and pipe separators as medium confidence', () => {
    expect(parseSongText('Blinding Lights - The Weeknd')).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      confidence: 'medium',
    });
    expect(parseSongText('Blinding Lights | The Weeknd')).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      confidence: 'medium',
    });
  });

  it('infers artist-first labels that start with a comma-separated artist list', () => {
    expect(parseSongText('Neeti Mohan, Javed Ali · Galat Baat Hai')).toMatchObject({
      title: 'Galat Baat Hai',
      artist: 'Neeti Mohan, Javed Ali',
      confidence: 'medium',
    });
    expect(parseSongText('A2O, A2O LITE•NEON')).toMatchObject({
      title: 'NEON',
      artist: 'A2O, A2O LITE',
      confidence: 'medium',
    });
  });

  it('keeps title-first labels when the artist list comes second', () => {
    expect(parseSongText('Galat Baat Hai · Neeti Mohan, Javed Ali')).toMatchObject({
      title: 'Galat Baat Hai',
      artist: 'Neeti Mohan, Javed Ali',
      confidence: 'high',
    });
  });

  it('ignores trailing extra segments', () => {
    expect(parseSongText('Blinding Lights · The Weeknd · After Hours')).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
    });
  });

  it('normalizes whitespace inside a label', () => {
    expect(parseSongText('  ♫\n Blinding   Lights\t·  The Weeknd  ')).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
    });
  });
});
