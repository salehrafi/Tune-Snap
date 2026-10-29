// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { byId, mockRect, render, setViewport } from '@/test/domLayout';
import { detectCurrentReel } from './index';

const REEL_URL = new URL('https://www.instagram.com/reel/CxYz123AbC/?igsh=tracking');

beforeEach(() => {
  setViewport();
  document.body.innerHTML = '';
});

function reelMarkup(id: string, href: string, text: string): string {
  return `
    <div id="${id}" class="reel">
      <video id="${id}-video"></video>
      <a id="${id}-link" href="${href}">${text}</a>
    </div>`;
}

function placeReel(id: string, top = 0, hidden = false): void {
  const reel = byId(id);
  if (hidden) reel.style.display = 'none';
  mockRect(reel, { top, left: 0, width: 1024, height: 768 });
  mockRect(byId(`${id}-video`), { top, left: 0, width: 1024, height: 768 });
  mockRect(byId(`${id}-link`), { top: top + 640, left: 40, width: 480, height: 28 });
}

describe('instagram adapter', () => {
  it('extracts the visible Reel, not an older offscreen Reel', () => {
    render(`
      <div id="feed">
        ${reelMarkup('old', '/reels/audio/111/', 'Galat Baat Hai · Neeti Mohan, Javed Ali')}
        ${reelMarkup('current', '/reels/audio/222/', 'Blinding Lights · The Weeknd')}
      </div>
    `);
    placeReel('old', -768);
    placeReel('current', 0);

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.platform).toBe('instagram');
    expect(result.reason).toBe('detected');
    expect(result.isReel).toBe(true);
    expect(result.reelUrl).toBe('https://www.instagram.com/reel/CxYz123AbC/');
    expect(result.track).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      confidence: 'high',
      evidence: 'audio-link',
    });
    expect(result.track?.title).not.toBe('Galat Baat Hai');
  });

  it('ignores a hidden preloaded Reel', () => {
    render(`
      <div id="feed">
        ${reelMarkup('old', '/reels/audio/111/', 'Galat Baat Hai · Neeti Mohan, Javed Ali')}
        ${reelMarkup('current', '/reels/audio/222/', 'Flowers · Miley Cyrus')}
      </div>
    `);
    placeReel('old', 0, true);
    placeReel('current', 0);

    expect(detectCurrentReel(document, REEL_URL).track?.title).toBe('Flowers');
  });

  it('reports music not detected when only a hidden Reel has a label', () => {
    render(reelMarkup('old', '/reels/audio/111/', 'Galat Baat Hai · Neeti Mohan, Javed Ali'));
    placeReel('old', 0, true);

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.reason).toBe('no-metadata');
    expect(result.track).toBeNull();
  });

  it('falls back to the visible scrolling music marquee', () => {
    render(`
      <div id="reel">
        <video id="video"></video>
        <span id="marquee">♫ vampire · Olivia Rodrigo</span>
      </div>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('marquee'), { top: 600, left: 40, width: 320, height: 24 });

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.reason).toBe('detected');
    expect(result.track).toMatchObject({
      title: 'vampire',
      artist: 'Olivia Rodrigo',
      evidence: 'music-glyph',
    });
  });

  it('uses an aria-label when the visible label is missing', () => {
    render(`
      <div id="reel">
        <video id="video"></video>
        <div id="label" role="button" aria-label="Audio: Flowers · Miley Cyrus"></div>
      </div>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('label'), { top: 600, left: 40, width: 300, height: 32 });

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.track).toMatchObject({
      title: 'Flowers',
      artist: 'Miley Cyrus',
      evidence: 'audio-label',
    });
  });

  it('detects original audio without inventing a title', () => {
    render(`
      <div id="reel">
        <video id="video"></video>
        <a id="link" href="/reels/audio/1/">Original audio</a>
      </div>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('link'), { top: 600, left: 40, width: 200, height: 24 });

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.reason).toBe('original-audio');
    expect(result.track).toBeNull();
  });

  it('returns no metadata when nothing music-related is visible', () => {
    render('<main><article>A post about coffee</article></main>');
    const result = detectCurrentReel(document, REEL_URL);

    expect(result.reason).toBe('no-metadata');
    expect(result.track).toBeNull();
    expect(result.reelUrl).toBe('https://www.instagram.com/reel/CxYz123AbC/');
  });

  it('does not detect a label without a visible video', () => {
    render('<div id="reel"><a id="link" href="/reels/audio/1/">Blinding Lights · The Weeknd</a></div>');
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('link'), { top: 600, left: 40, width: 400, height: 24 });

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.reason).toBe('no-metadata');
    expect(result.track).toBeNull();
  });

  it('does not treat an audio-only page as a Reel', () => {
    const result = detectCurrentReel(
      render('<div>Audio page</div>'),
      new URL('https://www.instagram.com/reels/audio/1234567890/'),
    );

    expect(result.isReel).toBe(false);
    expect(result.reelUrl).toBeNull();
    expect(result.platform).toBe('instagram');
  });

  it('supports /reels/<code> URLs', () => {
    const result = detectCurrentReel(
      render('<div></div>'),
      new URL('https://www.instagram.com/reels/CxYz123AbC/'),
    );
    expect(result.reelUrl).toBe('https://www.instagram.com/reel/CxYz123AbC/');
  });

  it('does not reuse a previous detection after the DOM changes', () => {
    render(reelMarkup('first', '/reels/audio/111/', 'Galat Baat Hai · Neeti Mohan, Javed Ali'));
    placeReel('first', 0);
    expect(detectCurrentReel(document, REEL_URL).track?.title).toBe('Galat Baat Hai');

    render(reelMarkup('second', '/reels/audio/222/', 'vampire · Olivia Rodrigo'));
    placeReel('second', 0);
    const next = detectCurrentReel(document, REEL_URL);
    expect(next.track?.title).toBe('vampire');
    expect(next.track?.title).not.toBe('Galat Baat Hai');
  });

  it('handles a real-world desktop layout: deep DOM, side-by-side label, artist-first text', () => {
    setViewport(1264, 749);
    const nest = (depth: number, inner: string): string => {
      let markup = inner;
      for (let index = 0; index < depth; index += 1) markup = `<div>${markup}</div>`;
      return markup;
    };
    render(`
      <div id="reel">
        ${nest(13, '<video id="video"></video>')}
        ${nest(13, '<a id="link" href="/reels/audio/1034034453030002/">A2O, A2O LITE•NEON</a>')}
      </div>
    `);
    // Geometry measured from a public Instagram Reel (logged-out shell).
    mockRect(byId('reel'), { top: 40, left: 200, width: 900, height: 680 });
    mockRect(byId('video'), { top: 87, left: 288, width: 337, height: 599 });
    mockRect(byId('link'), { top: 119, left: 686, width: 124, height: 18 });

    const result = detectCurrentReel(document, REEL_URL);

    expect(result.track).toMatchObject({
      title: 'NEON',
      artist: 'A2O, A2O LITE',
      confidence: 'high',
      evidence: 'audio-link',
    });
  });

  it('ignores a page-level audio label outside the Reel', () => {
    render(`
      <div id="reel">
        <video id="video"></video>
        <a id="link" href="/reels/audio/222/">Blinding Lights · The Weeknd</a>
      </div>
      <aside id="sidebar"><a id="outside" href="/reels/audio/999/">Suggested · Another Artist</a></aside>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('link'), { top: 600, left: 40, width: 400, height: 24 });
    mockRect(byId('sidebar'), { top: 0, left: 800, width: 224, height: 768 });
    mockRect(byId('outside'), { top: 100, left: 810, width: 200, height: 24 });

    expect(detectCurrentReel(document, REEL_URL).track?.title).toBe('Blinding Lights');
  });

  it('does not treat other hosts as Instagram', () => {
    const result = detectCurrentReel(
      render('<div></div>'),
      new URL('https://example.com/reel/abc'),
    );
    expect(result.platform).toBeNull();
    expect(result.reason).toBe('unsupported');
  });
});
