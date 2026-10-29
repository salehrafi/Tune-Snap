// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SongDraft } from '@/lib/types/song';
import type { RankedVideo } from '@/lib/types/youtube';
import type { ReelDetectionState } from '../hooks/useReelDetection';
import type { ApiKeyStatus, SearchViewState } from '../view-types';
import { Capture } from './Capture';

const draft: SongDraft = {
  title: '',
  artist: '',
  source: 'manual',
  reelUrl: null,
  origin: 'manual',
  confidence: null,
};

const apiKey: ApiKeyStatus = { loading: false, key: null, source: null };
const search: SearchViewState = { status: 'idle' };
const noop = (): void => undefined;

function render(detection: ReelDetectionState, overrides: Partial<SongDraft> = {}): string {
  return renderToStaticMarkup(
    <Capture
      detection={detection}
      draft={{ ...draft, ...overrides }}
      editing={false}
      search={search}
      selectedVideo={null as RankedVideo | null}
      apiKey={apiKey}
      searching={false}
      saving={false}
      onEditStart={noop}
      onEditDone={noop}
      onReset={noop}
      onChange={noop}
      onSwap={noop}
      onPlayNow={noop}
      onAdd={noop}
      onChooseVideo={noop}
      onOpenUrl={noop}
      onOpenSearch={noop}
      onOpenSettings={noop}
      onRefresh={noop}
    />,
  );
}

describe('Capture Instagram-only states', () => {
  it('shows the exact unsupported-site message and no capture controls', () => {
    const html = render({ status: 'unsupported', pageUrl: 'https://example.com' });

    expect(html).toContain('This extension works only on Instagram Reels.');
    expect(html).not.toContain('Add to wishlist');
    expect(html).not.toContain('<input');
  });

  it('shows the non-Reel message and no capture controls', () => {
    const html = render({ status: 'not-reel', pageUrl: 'https://www.instagram.com/explore/' });

    expect(html).toContain('Open an Instagram Reel to detect its music.');
    expect(html).not.toContain('Add to wishlist');
    expect(html).not.toContain('<input');
  });

  it('treats a ready non-Reel result the same way', () => {
    const html = render({
      status: 'ready',
      detection: {
        pageUrl: 'https://www.instagram.com/explore/',
        platform: 'instagram',
        reelUrl: null,
        isReel: false,
        track: null,
        reason: 'no-metadata',
      },
    });

    expect(html).toContain('Open an Instagram Reel to detect its music.');
    expect(html).not.toContain('Add to wishlist');
  });

  it('keeps manual fallback and YouTube/wishlist actions on an Instagram Reel with no detection', () => {
    const html = render({
      status: 'ready',
      detection: {
        pageUrl: 'https://www.instagram.com/reel/ABC/',
        platform: 'instagram',
        reelUrl: 'https://www.instagram.com/reel/ABC/',
        isReel: true,
        track: null,
        reason: 'no-metadata',
      },
    });

    expect(html).toContain('Music not detected on this Reel');
    expect(html).toContain('<input');
    expect(html).toContain('Add to wishlist');
    expect(html).toContain('Find on YouTube');
  });

  it('still renders a detected Instagram track with Play and wishlist actions', () => {
    const html = render(
      {
        status: 'ready',
        detection: {
          pageUrl: 'https://www.instagram.com/reel/ABC/',
          platform: 'instagram',
          reelUrl: 'https://www.instagram.com/reel/ABC/',
          isReel: true,
          track: {
            title: 'Blinding Lights',
            artist: 'The Weeknd',
            confidence: 'high',
            originalAudio: false,
            evidence: 'audio-link',
          },
          reason: 'detected',
        },
      },
      {
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        source: 'instagram',
        reelUrl: 'https://www.instagram.com/reel/ABC/',
        origin: 'detected',
      },
    );

    expect(html).toContain('Blinding Lights');
    expect(html).toContain('The Weeknd');
    expect(html).toContain('Add to wishlist');
    expect(html).toContain('Find on YouTube');
    expect(html).toContain('Open Reel');
  });
});
