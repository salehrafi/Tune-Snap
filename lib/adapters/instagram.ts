import type { ExtractionResult, SiteAdapter } from './types';
import { getReelContext } from './layout';
import { collectDomEvidence } from '@/lib/detection/dom-sources';
import { collectStructuredEvidence } from '@/lib/detection/structured';
import { runDetectionEngine } from '@/lib/detection/engine';

const HOST = 'www.instagram.com';
const REEL_PATH = /^\/reels?\/([A-Za-z0-9_-]+)/;
const AUDIO_PATH = /^\/reels?\/audio\/([A-Za-z0-9_-]+)/;

const AUDIO_HREF_FRAGMENTS = ['/reels/audio/', '/reel/audio/', '/audio/'];

export function instagramReelUrl(url: URL): string | null {
  if (AUDIO_PATH.test(url.pathname)) return null;
  const match = REEL_PATH.exec(url.pathname);
  if (match?.[1]) return `https://${HOST}/reel/${match[1]}/`;
  return null;
}

/**
 * Instagram Reels adapter.
 *
 * Instagram exposes the current track through an audio link, sometimes only
 * through the embedded `music_asset_info` record (audio_cluster_id, title,
 * display_artist). This adapter stacks those with accessible labels, visible
 * marquee text, and Media Session metadata; the engine correlates them and
 * scopes everything to the active Reel.
 */
export const instagramAdapter: SiteAdapter = {
  platform: 'instagram',

  matches(url: URL): boolean {
    return url.hostname === HOST;
  },

  isReel(url: URL): boolean {
    return REEL_PATH.test(url.pathname) && !AUDIO_PATH.test(url.pathname);
  },

  reelUrl(url: URL): string | null {
    return instagramReelUrl(url);
  },

  extract(document: Document, url: URL): ExtractionResult {
    const context = getReelContext(document);
    const dom = collectDomEvidence(document, {
      context,
      hrefFragments: AUDIO_HREF_FRAGMENTS,
    });
    const structured = collectStructuredEvidence(document, url, dom.audioIds);

    const result = runDetectionEngine(
      [...dom.evidence, ...structured],
      context,
      dom.caption,
    );
    return { ...result, reelUrl: instagramReelUrl(url) };
  },
};
