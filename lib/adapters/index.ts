import type { DetectionDiagnostics } from './types';
import type { DetectedTrack, SocialPlatform } from '@/lib/types/song';
import { instagramAdapter } from './instagram';
import type { SiteAdapter } from './types';

const ADAPTERS: readonly SiteAdapter[] = [instagramAdapter];

export type DetectionReason =
  | 'detected'
  | 'no-metadata'
  | 'original-audio'
  | 'ambiguous'
  | 'unsupported'
  | 'error';

export interface ReelDetection {
  pageUrl: string;
  platform: SocialPlatform | null;
  reelUrl: string | null;
  isReel: boolean;
  track: DetectedTrack | null;
  reason: DetectionReason;
  diagnostics?: DetectionDiagnostics;
}

export function findAdapter(url: URL): SiteAdapter | null {
  return ADAPTERS.find((adapter) => adapter.matches(url)) ?? null;
}

/**
 * Stable identity for the currently displayed Reel. Query/hash changes are not
 * a new Reel; a different Reel code is. Non-Reel URLs fall back to the full URL.
 */
export function reelIdentity(url: URL): string {
  const adapter = findAdapter(url);
  return adapter?.reelUrl(url) ?? url.href;
}

/**
 * A response is stale when it belongs to the URL the request started on, but
 * the active tab has already moved to a different Reel. A response for the
 * newer URL is not stale and must be accepted.
 */
export function isStaleReelResponse(
  responsePageUrl: string,
  requestedUrl: URL,
  activePageUrl: string | null,
): boolean {
  try {
    const responseIdentity = reelIdentity(new URL(responsePageUrl));
    const requestedIdentity = reelIdentity(requestedUrl);
    if (responseIdentity !== requestedIdentity) return false;
    if (!activePageUrl) return false;
    return reelIdentity(new URL(activePageUrl)) !== requestedIdentity;
  } catch {
    return false;
  }
}

/**
 * Read the current Reel from a live document. Called on demand (never on a
 * timer), so client-side navigation is picked up every time the popup asks.
 */
export function detectCurrentReel(document: Document, url: URL): ReelDetection {
  const adapter = findAdapter(url);
  if (!adapter) {
    return {
      pageUrl: url.href,
      platform: null,
      reelUrl: null,
      isReel: false,
      track: null,
      reason: 'unsupported',
    };
  }

  try {
    const result = adapter.extract(document, url);
    return {
      pageUrl: url.href,
      platform: adapter.platform,
      reelUrl: result.reelUrl,
      isReel: adapter.isReel(url),
      track: result.track,
      reason: result.reason,
      diagnostics: result.diagnostics,
    };
  } catch {
    return {
      pageUrl: url.href,
      platform: adapter.platform,
      reelUrl: adapter.reelUrl(url),
      isReel: adapter.isReel(url),
      track: null,
      reason: 'error',
    };
  }
}

function settledDetection(detection: ReelDetection): boolean {
  if (
    detection.reason === 'unsupported' ||
    detection.reason === 'error' ||
    detection.reason === 'original-audio'
  ) {
    return true;
  }
  return detection.track !== null && detection.track.confidence !== 'low';
}

export interface DetectWhenReadyOptions {
  timeoutMs?: number;
  debounceMs?: number;
  /** Injectable for tests; production reads the live page location. */
  getUrl?: () => URL;
}

/**
 * Wait briefly for delayed Reel rendering.
 *
 * A single MutationObserver is used only for the duration of the request (no
 * permanent polling). Every re-evaluation reads the current URL and DOM, so a
 * cached or previous Reel's result can never be returned.
 */
export async function detectCurrentReelWhenReady(
  document: Document,
  url: URL,
  options: DetectWhenReadyOptions = {},
): Promise<ReelDetection> {
  const timeoutMs = Math.max(0, options.timeoutMs ?? 1800);
  const debounceMs = Math.max(0, options.debounceMs ?? 120);
  const initial = detectCurrentReel(document, url);

  if (settledDetection(initial)) return initial;
  if (typeof MutationObserver === 'undefined' || !document.documentElement) {
    return initial;
  }

  return new Promise<ReelDetection>((resolve) => {
    let last = initial;
    let finished = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    const readUrl = (): URL => {
      if (options.getUrl) return options.getUrl();
      const href = document.defaultView?.location?.href ?? url.href;
      try {
        return new URL(href);
      } catch {
        return url;
      }
    };

    const finish = (detection: ReelDetection): void => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      if (deadline !== undefined) clearTimeout(deadline);
      resolve(detection);
    };

    const evaluate = (): void => {
      if (finished) return;
      last = detectCurrentReel(document, readUrl());
      if (settledDetection(last)) finish(last);
    };

    const schedule = (): void => {
      if (finished || debounceTimer !== undefined) return;
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        evaluate();
      }, debounceMs);
    };

    const observer = new MutationObserver(() => {
      schedule();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-label', 'title', 'href', 'src', 'hidden', 'aria-hidden'],
    });

    deadline = setTimeout(() => {
      // A busy page must not starve the last evaluation via debounce resets.
      evaluate();
      finish(last);
    }, timeoutMs);
    schedule();
  });
}

export { instagramAdapter };
export type { SiteAdapter };
