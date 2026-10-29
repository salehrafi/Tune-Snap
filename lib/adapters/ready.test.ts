// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { byId, mockRect, render, setViewport } from '@/test/domLayout';
import { detectCurrentReelWhenReady } from './index';

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

function appendLabel(href: string, text: string, top = 600): void {
  const reel = byId('reel');
  const link = document.createElement('a');
  link.id = 'late-label';
  link.setAttribute('href', href);
  link.textContent = text;
  reel.append(link);
  mockRect(link, { top, left: 40, width: 420, height: 24 });
}

describe('detectCurrentReelWhenReady', () => {
  it('observes delayed rendering and returns the newly visible track', async () => {
    renderReel();

    const pending = detectCurrentReelWhenReady(document, IG_URL, {
      timeoutMs: 500,
      debounceMs: 5,
      getUrl: () => IG_URL,
    });
    setTimeout(() => appendLabel('/reels/audio/222/', 'Blinding Lights · The Weeknd'), 10);

    const result = await pending;
    expect(result.reason).toBe('detected');
    expect(result.track?.title).toBe('Blinding Lights');
  });

  it('returns no metadata after the timeout without a label', async () => {
    renderReel();

    const result = await detectCurrentReelWhenReady(document, IG_URL, {
      timeoutMs: 40,
      debounceMs: 5,
      getUrl: () => IG_URL,
    });

    expect(result.reason).toBe('no-metadata');
    expect(result.track).toBeNull();
  });

  it('does not retain a previous Reel when navigation changes the URL and DOM', async () => {
    renderReel();
    let currentUrl = IG_URL;

    const pending = detectCurrentReelWhenReady(document, IG_URL, {
      timeoutMs: 500,
      debounceMs: 5,
      getUrl: () => currentUrl,
    });

    setTimeout(() => {
      currentUrl = NEXT_URL;
      appendLabel('/reels/audio/333/', 'Flowers · Miley Cyrus');
    }, 10);

    const result = await pending;
    expect(result.pageUrl).toBe(NEXT_URL.href);
    expect(result.track?.title).toBe('Flowers');
  });

  it('returns immediately when the initial detection is already settled', async () => {
    renderReel();
    appendLabel('/reels/audio/222/', 'Blinding Lights · The Weeknd');

    const started = Date.now();
    const result = await detectCurrentReelWhenReady(document, IG_URL, {
      timeoutMs: 2_000,
      getUrl: () => IG_URL,
    });

    expect(result.track?.title).toBe('Blinding Lights');
    expect(Date.now() - started).toBeLessThan(500);
  });
});
