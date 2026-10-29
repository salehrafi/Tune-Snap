// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { byId, mockRect, render, setViewport } from '@/test/domLayout';
import type { ReelChangedMessage } from '@/lib/messaging';
import { detectionSignature, startReelWatch } from './watch';

const IG_URL = new URL('https://www.instagram.com/reel/CxYz123AbC/');
const NEXT_URL = new URL('https://www.instagram.com/reel/NextReel99/');

beforeEach(() => {
  setViewport();
  document.body.innerHTML = '';
});

function renderReel(): void {
  render(`
    <div id="reel">
      <video id="video"></video>
    </div>
  `);
  mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
  mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
}

function appendLabel(text: string, href = '/reels/audio/222/'): void {
  const link = document.createElement('a');
  link.id = 'label';
  link.setAttribute('href', href);
  link.textContent = text;
  byId('reel').append(link);
  mockRect(link, { top: 600, left: 40, width: 420, height: 24 });
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('startReelWatch', () => {
  it('emits when a delayed label appears and stops after cleanup', async () => {
    renderReel();
    const messages: ReelChangedMessage[] = [];
    let url = IG_URL;
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, getUrl: () => url },
    );

    appendLabel('Blinding Lights · The Weeknd');
    await wait(80);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.detection.track?.title).toBe('Blinding Lights');

    stop();
    byId('label').textContent = 'Flowers · Miley Cyrus';
    await wait(50);
    expect(messages).toHaveLength(1);

    url = NEXT_URL;
    expect(detectionSignature(messages[0]!.detection)).toContain('instagram.com/reel/CxYz123AbC');
  });

  it('emits a new result after the Reel changes', async () => {
    renderReel();
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, getUrl: () => IG_URL },
    );

    byId('label').textContent = 'Flowers · Miley Cyrus';
    await wait(80);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.at(-1)?.detection.track?.title).toBe('Flowers');
    stop();
  });

  it('emits a no-metadata result when the label disappears', async () => {
    renderReel();
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, getUrl: () => IG_URL },
    );

    byId('label').remove();
    await wait(80);

    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(messages.at(-1)?.detection.track).toBeNull();
    stop();
  });

  it('re-evaluates when the Reel DOM changed before the URL did', async () => {
    renderReel();
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    let url = IG_URL;
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, urlPollMs: 5, getUrl: () => url },
    );

    // Instagram can update the reused label element first, then commit the SPA
    // URL without another DOM mutation.
    byId('label').textContent = 'Flowers · Miley Cyrus';
    await wait(40);
    url = NEXT_URL;
    await wait(100);

    expect(messages.at(-1)?.detection.pageUrl).toBe(NEXT_URL.href);
    expect(messages.at(-1)?.detection.track?.title).toBe('Flowers');
    stop();
  });

  it('does not re-approve the old structured record after a URL-only change', async () => {
    renderReel();
    const script = document.createElement('script');
    script.type = 'application/json';
    script.textContent = JSON.stringify({
      code: 'CxYz123AbC',
      music_asset_info: {
        audio_cluster_id: '222',
        title: 'Blinding Lights',
        display_artist: 'The Weeknd',
      },
    });
    document.body.prepend(script);
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    let url = IG_URL;
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, urlPollMs: 5, getUrl: () => url },
    );

    url = NEXT_URL;
    await wait(100);

    expect(messages.at(-1)?.detection.pageUrl).toBe(NEXT_URL.href);
    expect(messages.at(-1)?.detection.track).toBeNull();
    expect(messages.at(-1)?.detection.reason).toBe('no-metadata');
    stop();
  });

  it('clears the previous song when only the URL changes', async () => {
    renderReel();
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    let url = IG_URL;
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, urlPollMs: 5, getUrl: () => url },
    );

    url = NEXT_URL;
    await wait(100);

    expect(messages.at(-1)?.detection.pageUrl).toBe(NEXT_URL.href);
    expect(messages.at(-1)?.detection.track).toBeNull();
    expect(messages.at(-1)?.detection.reason).toBe('no-metadata');
    stop();
  });

  it('accepts the same song when the visible audio link changed for the new Reel', async () => {
    renderReel();
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    let url = IG_URL;
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, urlPollMs: 5, getUrl: () => url },
    );

    url = NEXT_URL;
    await wait(60);
    expect(messages.at(-1)?.detection.track).toBeNull();

    byId('label').setAttribute('href', '/reels/audio/333/');
    await wait(80);

    expect(messages.at(-1)?.detection.pageUrl).toBe(NEXT_URL.href);
    expect(messages.at(-1)?.detection.track?.title).toBe('Blinding Lights');
    stop();
  });

  it('does not emit repeatedly for the same Reel without changes', async () => {
    renderReel();
    appendLabel('Blinding Lights · The Weeknd');
    const messages: ReelChangedMessage[] = [];
    const stop = startReelWatch(
      document,
      { postMessage: (message) => messages.push(message) },
      { debounceMs: 5, getUrl: () => IG_URL },
    );

    await wait(120);
    expect(messages).toHaveLength(0);
    stop();
  });

  it('detectionSignature changes with the URL and track', () => {
    const base = {
      pageUrl: IG_URL.href,
      platform: 'instagram' as const,
      reelUrl: 'https://www.instagram.com/reel/CxYz123AbC/',
      isReel: true,
      reason: 'detected' as const,
      track: {
        title: 'Blinding Lights',
        artist: 'The Weeknd',
        confidence: 'high' as const,
        originalAudio: false,
        evidence: 'audio-link',
      },
    };
    const next = {
      ...base,
      pageUrl: NEXT_URL.href,
      track: { ...base.track, title: 'Flowers' },
    };
    expect(detectionSignature(base)).not.toBe(detectionSignature(next));
  });
});
