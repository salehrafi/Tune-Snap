// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { byId, mockRect, render, setViewport } from '@/test/domLayout';
import { detectCurrentReel } from '@/lib/adapters';

const IG_URL = new URL('https://www.instagram.com/reel/CxYz123AbC/');

beforeEach(() => {
  setViewport();
  document.body.innerHTML = '';
});

function renderReel(inner: string): void {
  render(`
    <div id="reel">
      <video id="video"></video>
      ${inner}
    </div>
  `);
  mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
  mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
}

function placeLink(id: string, left = 40): void {
  mockRect(byId(id), { top: 600, left, width: 420, height: 24 });
}

function structuredScript(payload: unknown): string {
  return `<script type="application/json">${JSON.stringify(payload)}</script>`;
}

describe('detection engine', () => {
  it('uses structured music data tied to the current Reel and reconciles artist-first link text', () => {
    renderReel(`
      ${structuredScript({
        data: {
          code: 'DfCiwVEosgE',
          clips_metadata: {
            music_info: {
              music_asset_info: {
                audio_cluster_id: '222',
                title: 'NEON',
                display_artist: 'A2O, A2O LITE',
              },
            },
          },
        },
      })}
      <a id="link" href="/reels/audio/222/">A2O, A2O LITE•NEON</a>
    `);
    placeLink('link');

    const result = detectCurrentReel(document, new URL('https://www.instagram.com/reel/DfCiwVEosgE/'));

    expect(result.reason).toBe('detected');
    expect(result.track).toMatchObject({
      title: 'NEON',
      artist: 'A2O, A2O LITE',
      confidence: 'high',
    });
    expect(result.track?.evidence).toContain('structured-music');
    expect(result.track?.evidence).toContain('audio-link');
    expect(result.diagnostics?.clusters).toBe(2);
    expect(result.diagnostics?.score).toBeGreaterThan(0.9);
  });

  it('picks the structured record matching the current audio id, not a preloaded one', () => {
    renderReel(`
      ${structuredScript({
        clips_metadata: {
          music_info: {
            music_asset_info: {
              audio_cluster_id: '111',
              title: 'Other Song',
              display_artist: 'Other Artist',
            },
          },
        },
      })}
      ${structuredScript({
        clips_metadata: {
          music_info: {
            music_asset_info: {
              audio_cluster_id: '222',
              title: 'Current Song',
              display_artist: 'Current Artist',
            },
          },
        },
      })}
      <a id="link" href="/reels/audio/222/">Current Song · Current Artist</a>
    `);
    placeLink('link');

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track?.title).toBe('Current Song');
    expect(result.track?.artist).toBe('Current Artist');
    expect(result.track?.title).not.toBe('Other Song');
  });

  it('returns ambiguous when two strong visible labels conflict', () => {
    renderReel(`
      <a id="first" href="/reels/audio/111/">Blinding Lights · The Weeknd</a>
      <a id="second" href="/reels/audio/222/">Flowers · Miley Cyrus</a>
    `);
    placeLink('first');
    placeLink('second', 500);

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toBeNull();
    expect(result.reason).toBe('ambiguous');
    expect(result.diagnostics?.runnerUp).not.toBeNull();
  });

  it('does not double-count a link and its own aria-label', () => {
    renderReel(`
      <a id="link" href="/reels/audio/111/" aria-label="Audio: Blinding Lights · The Weeknd">Blinding Lights · The Weeknd</a>
    `);
    placeLink('link');

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track?.title).toBe('Blinding Lights');
    expect(result.diagnostics?.clusters).toBe(1);
    expect(result.diagnostics?.sources).toEqual(['audio-link']);
    expect(result.track?.evidence).toBe('audio-link');
  });

  it('keeps original and remix as conflicting identities instead of merging them', () => {
    renderReel(`
      <a id="original" href="/reels/audio/111/">Blinding Lights · The Weeknd</a>
      <a id="remix" href="/reels/audio/222/">Blinding Lights (Remix) · The Weeknd</a>
    `);
    placeLink('original');
    placeLink('remix', 500);

    const result = detectCurrentReel(document, IG_URL);

    expect(result.reason).toBe('ambiguous');
    expect(result.track).toBeNull();
    expect(result.diagnostics?.runnerUp).not.toBeNull();
  });

  it('can detect from a structured record when no visible link exists', () => {
    renderReel(
      structuredScript({
        data: {
          code: 'CxYz123AbC',
          clips_metadata: {
            music_info: {
              music_asset_info: {
                audio_cluster_id: '333',
                title: 'Structured Song',
                display_artist: 'Structured Artist',
              },
            },
          },
        },
      }),
    );

    const result = detectCurrentReel(document, IG_URL);

    expect(result.reason).toBe('detected');
    expect(result.track).toMatchObject({
      title: 'Structured Song',
      artist: 'Structured Artist',
      confidence: 'high',
    });
  });

  it('ignores malformed structured data and falls back to visible evidence', () => {
    renderReel(`
      <script type="application/json">{"music_asset_info": {"title": </script>
      <a id="link" href="/reels/audio/111/">Blinding Lights · The Weeknd</a>
    `);
    placeLink('link');

    const result = detectCurrentReel(document, IG_URL);

    expect(result.reason).toBe('detected');
    expect(result.track?.title).toBe('Blinding Lights');
  });

  it('does not guess between multiple unmatched structured records', () => {
    renderReel(`
      ${structuredScript({
        clips_metadata: {
          music_info: {
            music_asset_info: { audio_cluster_id: '111', title: 'First Song', display_artist: 'First Artist' },
          },
        },
      })}
      ${structuredScript({
        clips_metadata: {
          music_info: {
            music_asset_info: { audio_cluster_id: '222', title: 'Second Song', display_artist: 'Second Artist' },
          },
        },
      })}
    `);

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toBeNull();
    expect(['ambiguous', 'no-metadata']).toContain(result.reason);
  });

  it('detects a plain visible song/artist label with no link, glyph or aria-label', () => {
    renderReel('<div id="label">Blinding Lights · The Weeknd</div>');
    mockRect(byId('label'), { top: 600, left: 40, width: 420, height: 24 });

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      confidence: 'medium',
    });
    expect(result.track?.evidence).toContain('visible-label');
  });

  it('does not treat an ordinary caption below the video as the music label', () => {
    renderReel('<div id="label">Blinding Lights · The Weeknd</div>');
    mockRect(byId('label'), { top: 800, left: 40, width: 420, height: 24 });

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toBeNull();
    expect(result.reason).toBe('no-metadata');
  });

  it('reads music data attributes as accessible evidence', () => {
    renderReel(
      '<div id="label" data-testid="music-label" data-song-title="Blinding Lights · The Weeknd"></div>',
    );
    mockRect(byId('label'), { top: 600, left: 40, width: 420, height: 24 });

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
    });
    expect(result.track?.evidence).toContain('title-attribute');
  });

  it('prefers a strong link over a conflicting glyph in the same Reel', () => {
    renderReel(`
      <a id="link" href="/reels/audio/111/">Blinding Lights · The Weeknd</a>
      <span id="glyph">♪ Flowers · Miley Cyrus</span>
    `);
    placeLink('link');
    mockRect(byId('glyph'), { top: 640, left: 40, width: 420, height: 24 });

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track?.title).toBe('Blinding Lights');
    expect(result.track?.confidence).toBe('high');
    expect(result.reason).toBe('detected');
  });

  it('returns a title-only link with low confidence instead of inventing an artist', () => {
    renderReel('<a id="link" href="/reels/audio/111/">Blinding Lights</a>');
    placeLink('link');

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toMatchObject({
      title: 'Blinding Lights',
      artist: null,
      confidence: 'low',
    });
  });

  it('prefers the current Original audio label over a stale visible song from a shared feed', () => {
    render(`
      <div id="feed">
        <div id="old">
          <video id="old-video"></video>
          <a id="stale" href="/reels/audio/999/">Galat Baat Hai · Neeti Mohan, Javed Ali</a>
        </div>
        <div id="current">
          <video id="video"></video>
          <a id="original" href="/reels/audio/111/">Original audio</a>
        </div>
      </div>
    `);
    mockRect(byId('feed'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('old'), { top: -768, left: 0, width: 1024, height: 768 });
    mockRect(byId('old-video'), { top: -768, left: 0, width: 1024, height: 768 });
    mockRect(byId('stale'), { top: 0, left: 40, width: 420, height: 24 });
    mockRect(byId('current'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('original'), { top: 600, left: 40, width: 220, height: 24 });

    const result = detectCurrentReel(document, IG_URL);

    expect(result.reason).toBe('original-audio');
    expect(result.track).toBeNull();
  });

  it('does not accept a weak page-level label outside the Reel as a detection', () => {
    render(`
      <div id="reel"><video id="video"></video></div>
      <div id="page-ui"><a id="link" href="/reels/audio/111/">Blinding Lights · The Weeknd</a></div>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('page-ui'), { top: 0, left: 0, width: 1024, height: 40 });
    placeLink('link');

    const result = detectCurrentReel(document, IG_URL);

    expect(result.track).toBeNull();
    expect(result.reason).toBe('no-metadata');
  });

  it('reports the evidence score for transparency', () => {
    renderReel('<a id="link" href="/reels/audio/111/">Blinding Lights · The Weeknd</a>');
    placeLink('link');

    const result = detectCurrentReel(document, IG_URL);

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics?.score).toBeGreaterThan(0);
    expect(result.diagnostics?.score).toBeLessThanOrEqual(1);
    expect(result.diagnostics?.sources.length).toBeGreaterThan(0);
    expect(result.diagnostics?.context).toBeGreaterThan(0.5);
  });
});
