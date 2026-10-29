// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectCurrentReel,
  findAdapter,
  isStaleReelResponse,
  reelIdentity,
} from './index';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Instagram-only adapter registry', () => {
  it('resolves Instagram URLs and rejects every other host', () => {
    expect(findAdapter(new URL('https://www.instagram.com/reel/ABC123/'))?.platform).toBe(
      'instagram',
    );
    expect(findAdapter(new URL('https://www.instagram.com/explore/'))?.platform).toBe(
      'instagram',
    );
    expect(findAdapter(new URL('https://example.com/reel/123'))).toBeNull();
  });

  it('returns unsupported without reading non-Instagram pages', () => {
    const result = detectCurrentReel(document, new URL('https://example.com/reel/123'));

    expect(result).toMatchObject({
      platform: null,
      isReel: false,
      track: null,
      reason: 'unsupported',
    });
  });

  it('marks Instagram non-Reel pages as non-Reel', () => {
    const result = detectCurrentReel(document, new URL('https://www.instagram.com/explore/'));

    expect(result.platform).toBe('instagram');
    expect(result.isReel).toBe(false);
    expect(result.reelUrl).toBeNull();
  });

  it('does not treat an Instagram audio page as a Reel', () => {
    const result = detectCurrentReel(
      document,
      new URL('https://www.instagram.com/reels/audio/123456789/'),
    );

    expect(result.isReel).toBe(false);
    expect(result.reelUrl).toBeNull();
  });

  it('uses a stable Reel identity and ignores query/hash changes', () => {
    const first = new URL('https://www.instagram.com/reel/ABC123/');
    const query = new URL('https://www.instagram.com/reel/ABC123/?hl=en');
    const next = new URL('https://www.instagram.com/reel/XYZ789/');

    expect(reelIdentity(first)).toBe(reelIdentity(query));
    expect(reelIdentity(first)).not.toBe(reelIdentity(next));
  });

  it('detects a stale async response for a previous Reel', () => {
    const requested = new URL('https://www.instagram.com/reel/ABC123/');
    const active = 'https://www.instagram.com/reel/XYZ789/';

    expect(
      isStaleReelResponse('https://www.instagram.com/reel/ABC123/', requested, active),
    ).toBe(true);
    expect(
      isStaleReelResponse('https://www.instagram.com/reel/XYZ789/', requested, active),
    ).toBe(false);
    expect(
      isStaleReelResponse('https://www.instagram.com/reel/ABC123/', requested, requested.href),
    ).toBe(false);
  });
});
