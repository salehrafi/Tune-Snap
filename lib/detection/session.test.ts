// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { byId, mockRect, render, setViewport } from '@/test/domLayout';
import type { ReelDetection } from '@/lib/adapters';
import { detectionTrackKey, reconcileSession } from './session';

const A = 'https://www.instagram.com/reel/AAA/';
const B = 'https://www.instagram.com/reel/BBB/';

function detection(title: string, artist: string | null): ReelDetection {
  return {
    pageUrl: A,
    platform: 'instagram',
    reelUrl: A,
    isReel: true,
    reason: 'detected',
    track: {
      title,
      artist,
      confidence: 'high',
      originalAudio: false,
      evidence: 'audio-link',
    },
  };
}

beforeEach(() => {
  setViewport();
  document.body.innerHTML = '';
});

describe('reconcileSession', () => {
  it('rejects the previous track on an identity change and keeps rejecting it', () => {
    const first = reconcileSession(null, A, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    expect(first.suppressed).toBe(false);
    expect(first.state).toMatchObject({ identity: A, blocked: false });

    const stale = reconcileSession(first.state, B, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    expect(stale.suppressed).toBe(true);
    expect(stale.detection.track).toBeNull();
    expect(stale.detection.reason).toBe('no-metadata');
    expect(stale.state).toMatchObject({ identity: B, trackKey: first.state.trackKey, blocked: true });

    const again = reconcileSession(stale.state, B, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    expect(again.suppressed).toBe(true);
  });

  it('accepts a genuinely new track or a changed music label', () => {
    const first = reconcileSession(null, A, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    const stale = reconcileSession(first.state, B, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    const newTrack = reconcileSession(stale.state, B, detection('Flowers', 'Miley Cyrus'), 'sig-b');
    expect(newTrack.suppressed).toBe(false);
    expect(newTrack.state).toMatchObject({ identity: B, blocked: false });

    const sameSongNewLink = reconcileSession(
      first.state,
      B,
      detection('Blinding Lights', 'The Weeknd'),
      'sig-b',
    );
    expect(sameSongNewLink.suppressed).toBe(false);
  });

  it('does not clear the stale guard when metadata is missing', () => {
    const first = reconcileSession(null, A, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    const empty: ReelDetection = {
      pageUrl: B,
      platform: 'instagram',
      reelUrl: B,
      isReel: true,
      reason: 'no-metadata',
      track: null,
    };
    const missing = reconcileSession(first.state, B, empty, 'sig-a');
    expect(missing.detection.track).toBeNull();
    expect(missing.state).toMatchObject({ identity: B, blocked: true });

    const oldAgain = reconcileSession(missing.state, B, detection('Blinding Lights', 'The Weeknd'), 'sig-a');
    expect(oldAgain.suppressed).toBe(true);
  });

  it('creates stable track keys', () => {
    expect(detectionTrackKey(detection('  Blinding Lights ', 'The Weeknd'))).toBe(
      'blinding lights|the weeknd',
    );
  });
});

describe('session-aware watcher start', () => {
  it('clears the old label when the popup reopens after a Reel change', async () => {
    render('<div id="reel"><video id="video"></video><a id="label" href="/reels/audio/222/">Blinding Lights · The Weeknd</a></div>');
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('label'), { top: 600, left: 40, width: 420, height: 24 });

    const { detectCurrentReel, reelIdentity } = await import('@/lib/adapters');
    const { musicDomSignature } = await import('./session');
    const { startReelWatch } = await import('./watch');
    const initialDetection = detectCurrentReel(document, new URL(A));
    const initialSession = reconcileSession(
      null,
      reelIdentity(new URL(A)),
      initialDetection,
      musicDomSignature(document),
    ).state;

    const messages: unknown[] = [];
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      {
        session: initialSession,
        debounceMs: 5,
        getUrl: () => new URL(B),
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((messages.at(-1) as { detection?: { track?: unknown; pageUrl?: string } })?.detection?.track).toBeNull();
    expect((messages.at(-1) as { detection?: { pageUrl?: string } })?.detection?.pageUrl).toBe(B);

    byId('label').textContent = 'Flowers · Miley Cyrus';
    byId('label').setAttribute('href', '/reels/audio/333/');
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect((messages.at(-1) as { detection?: { track?: { title?: string } } })?.detection?.track?.title).toBe(
      'Flowers',
    );
    stop();
  });
});
