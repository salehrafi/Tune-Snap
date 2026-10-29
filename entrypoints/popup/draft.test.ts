import { describe, expect, it } from 'vitest';
import type { ReelDetection } from '@/lib/adapters';
import { applyEdit, blankDraft, draftFromDetection } from './draft';

function detection(overrides: Partial<ReelDetection> = {}): ReelDetection {
  return {
    pageUrl: 'https://www.instagram.com/reel/ABC/',
    platform: 'instagram',
    reelUrl: 'https://www.instagram.com/reel/ABC/',
    isReel: true,
    track: null,
    reason: 'no-metadata',
    ...overrides,
  };
}

describe('draftFromDetection', () => {
  it('copies detected metadata and marks it as detected', () => {
    const draft = draftFromDetection({
      status: 'ready',
      detection: detection({
        track: {
          title: 'Blinding Lights',
          artist: 'The Weeknd',
          confidence: 'high',
          originalAudio: false,
          evidence: 'audio-link',
        },
        reason: 'detected',
      }),
    });

    expect(draft).toEqual({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      source: 'instagram',
      reelUrl: 'https://www.instagram.com/reel/ABC/',
      origin: 'detected',
      confidence: 'high',
    });
  });

  it('uses an empty artist string when only the title is known', () => {
    const draft = draftFromDetection({
      status: 'ready',
      detection: detection({
        track: {
          title: 'Blinding Lights',
          artist: null,
          confidence: 'low',
          originalAudio: false,
          evidence: 'music-glyph',
        },
        reason: 'detected',
      }),
    });

    expect(draft.artist).toBe('');
    expect(draft.confidence).toBe('low');
  });

  it('keeps the platform and Reel link for manual entry when nothing was detected', () => {
    const draft = draftFromDetection({
      status: 'ready',
      detection: detection({ reason: 'original-audio' }),
    });

    expect(draft).toEqual({
      title: '',
      artist: '',
      source: 'instagram',
      reelUrl: 'https://www.instagram.com/reel/ABC/',
      origin: 'manual',
      confidence: null,
    });
  });

  it('uses the adapter platform when the content script could not be reached', () => {
    const draft = draftFromDetection({
      status: 'unavailable',
      pageUrl: 'https://www.instagram.com/reel/ABC/',
      platform: 'instagram',
      reelUrl: 'https://www.instagram.com/reel/ABC/',
      isReel: true,
    });

    expect(draft.source).toBe('instagram');
    expect(draft.reelUrl).toBe('https://www.instagram.com/reel/ABC/');
    expect(draft.origin).toBe('manual');
  });

  it('falls back to a manual draft on unsupported pages', () => {
    const draft = draftFromDetection({ status: 'unsupported', pageUrl: 'https://example.com' });
    expect(draft).toEqual(blankDraft());
  });
});

describe('applyEdit', () => {
  const base = draftFromDetection({
    status: 'ready',
    detection: detection({
      track: {
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        confidence: 'high',
        originalAudio: false,
        evidence: 'audio-link',
      },
      reason: 'detected',
    }),
  });

  it('marks detected metadata as edited', () => {
    const edited = applyEdit(base, { title: 'Blinding Lights (Remix)' });
    expect(edited.origin).toBe('edited');
    expect(edited.artist).toBe('The Weeknd');
  });

  it('keeps manual drafts manual', () => {
    const manual = blankDraft();
    expect(applyEdit(manual, { title: 'Song' }).origin).toBe('manual');
  });

  it('leaves other fields untouched', () => {
    const edited = applyEdit(base, { artist: 'The Weeknd feat. Rosalía' });
    expect(edited.reelUrl).toBe(base.reelUrl);
    expect(edited.source).toBe(base.source);
    expect(edited.confidence).toBe(base.confidence);
  });
});
