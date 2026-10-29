import type { ReelDetection } from '@/lib/adapters';
import {
  assessElementContext,
  getReelContext,
  isRendered,
} from '@/lib/adapters/layout';

/**
 * Content-script lifetime state for the Reel whose metadata was last accepted.
 * It survives popup close/reopen, unlike the popup-lifetime watcher, and lets a
 * fresh request reject the previous Reel's still-mounted label.
 */
export interface ReelSessionState {
  identity: string;
  /** Track accepted for this/previous Reel; kept as the stale guard. */
  trackKey: string;
  musicSignature: string;
  /** A new URL has not yet produced a fresh/accepted track. */
  blocked: boolean;
}

export function detectionTrackKey(detection: ReelDetection): string {
  if (!detection.track) return '';
  return [
    detection.track.title.trim().toLowerCase(),
    (detection.track.artist ?? '').trim().toLowerCase(),
  ].join('|');
}

export function musicDomSignature(document: Document): string {
  const parts: string[] = [];
  const context = getReelContext(document);
  for (const anchor of Array.from(
    document.querySelectorAll('a[href*="/audio"]'),
  ).slice(0, 20)) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    if (!isRendered(anchor)) continue;
    if (assessElementContext(anchor, context).score < 0.45) continue;
    parts.push(
      [
        href,
        anchor.textContent?.trim() ?? '',
        anchor.getAttribute('aria-label') ?? '',
        anchor.getAttribute('title') ?? '',
      ].join('|'),
    );
  }
  return parts.join('::');
}

export interface ReconciledDetection {
  detection: ReelDetection;
  state: ReelSessionState;
  suppressed: boolean;
}

/**
 * Reject the previous Reel's still-visible track after an SPA URL change.
 *
 * A new track key, or a changed visible music label (new audio link/text), is
 * accepted. A URL/identity change whose detection is exactly the previously
 * accepted track and unchanged visible music DOM is suppressed until fresh
 * metadata appears.
 */
export function reconcileSession(
  previous: ReelSessionState | null,
  identity: string,
  detection: ReelDetection,
  musicSignature: string,
): ReconciledDetection {
  const key = detectionTrackKey(detection);
  const previousKey = previous?.trackKey ?? '';
  const previousSignature = previous?.musicSignature ?? '';
  const identityChanged = previous !== null && previous.identity !== identity;
  const signatureChanged =
    musicSignature.length > 0 && musicSignature !== previousSignature;
  const samePreviousTrack = key.length > 0 && key === previousKey;
  const stale =
    previous !== null &&
    samePreviousTrack &&
    (identityChanged || previous.blocked) &&
    !signatureChanged;

  if (stale) {
    return {
      detection: {
        ...detection,
        track: null,
        reason: detection.isReel ? 'no-metadata' : detection.reason,
        diagnostics: undefined,
      },
      state: {
        identity,
        trackKey: previousKey,
        musicSignature: previousSignature,
        blocked: true,
      },
      suppressed: true,
    };
  }

  if (detection.track) {
    const establishAnchor =
      previous === null ||
      identityChanged ||
      previous.blocked ||
      previousKey.length === 0;
    return {
      detection,
      state: {
        identity,
        // A same-URL DOM update is displayed, but the accepted track anchor is
        // only moved when the URL changed (or there was no anchor yet). This
        // keeps a label changed just before an SPA URL commit from being
        // mistaken for the old Reel's track.
        trackKey: establishAnchor ? key : previousKey,
        musicSignature: establishAnchor ? musicSignature : previousSignature,
        blocked: false,
      },
      suppressed: false,
    };
  }

  return {
    detection,
    state: {
      identity,
      trackKey: previousKey,
      musicSignature: previousSignature,
      blocked:
        previousKey.length > 0 &&
        (identityChanged || previous?.blocked === true),
    },
    suppressed: false,
  };
}
