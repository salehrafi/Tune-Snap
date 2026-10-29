// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { byId, mockRect, render, setViewport } from '@/test/domLayout';
import {
  assessElementContext,
  currentViewport,
  domDistance,
  findActiveVideo,
  getReelContext,
  isRendered,
} from './layout';

beforeEach(() => {
  setViewport();
  document.body.innerHTML = '';
});

describe('isRendered', () => {
  it('accepts a visible element inside the viewport', () => {
    render('<div id="label">Song · Artist</div>');
    mockRect(byId('label'), { top: 500, left: 20, width: 200, height: 24 });
    expect(isRendered(byId('label'))).toBe(true);
  });

  it('rejects zero-sized and offscreen elements', () => {
    render('<div id="zero"></div><div id="offscreen"></div>');
    mockRect(byId('zero'), { top: 0, left: 0, width: 0, height: 0 });
    mockRect(byId('offscreen'), { top: -200, left: 0, width: 200, height: 24 });
    expect(isRendered(byId('zero'))).toBe(false);
    expect(isRendered(byId('offscreen'))).toBe(false);
  });

  it('rejects elements hidden by display:none, visibility:hidden, opacity or aria-hidden ancestors', () => {
    render(`
      <div style="display:none"><div id="display"></div></div>
      <div style="visibility:hidden"><div id="visibility"></div></div>
      <div style="opacity:0"><div id="opacity"></div></div>
      <div hidden><div id="hidden"></div></div>
      <div aria-hidden="true"><div id="aria"></div></div>
    `);
    for (const id of ['display', 'visibility', 'opacity', 'hidden', 'aria']) {
      mockRect(byId(id), { top: 10, left: 10, width: 100, height: 20 });
      expect(isRendered(byId(id))).toBe(false);
    }
  });

  it('rejects elements in a detached document', () => {
    const parsed = new DOMParser().parseFromString('<div id="label"></div>', 'text/html');
    const element = parsed.getElementById('label');
    expect(element).not.toBeNull();
    expect(isRendered(element as Element)).toBe(false);
  });
});

describe('findActiveVideo', () => {
  it('picks the largest visible video', () => {
    render('<video id="small"></video><video id="large"></video>');
    mockRect(byId('small'), { top: 100, left: 100, width: 320, height: 240 });
    mockRect(byId('large'), { top: 0, left: 0, width: 1024, height: 768 });

    expect(findActiveVideo(document)?.id).toBe('large');
  });

  it('ignores hidden and offscreen videos', () => {
    render(`
      <video id="hidden"></video>
      <video id="offscreen"></video>
      <video id="visible"></video>
    `);
    byId('hidden').style.display = 'none';
    mockRect(byId('hidden'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('offscreen'), { top: -900, left: 0, width: 1024, height: 768 });
    mockRect(byId('visible'), { top: 0, left: 0, width: 800, height: 600 });

    expect(findActiveVideo(document)?.id).toBe('visible');
  });

  it('prefers a playing video when geometry ties', () => {
    render('<video id="paused"></video><video id="playing"></video>');
    for (const id of ['paused', 'playing']) {
      mockRect(byId(id), { top: 0, left: 0, width: 1024, height: 768 });
    }
    Object.defineProperty(byId('playing'), 'paused', { configurable: true, value: false });

    expect(findActiveVideo(document)?.id).toBe('playing');
  });

  it('returns null when no video is visible', () => {
    render('<div>No video here</div>');
    expect(findActiveVideo(document)).toBeNull();
  });
});

describe('Reel context strength', () => {
  function renderReel(): void {
    render(`
      <div id="reel">
        <video id="video"></video>
        <a id="label">Song · Artist</a>
      </div>
      <div id="banner"><a id="global">Global Player · Artist</a></div>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('label'), { top: 600, left: 40, width: 300, height: 24 });
    mockRect(byId('banner'), { top: 0, left: 0, width: 1024, height: 40 });
    mockRect(byId('global'), { top: 0, left: 0, width: 300, height: 24 });
  }

  it('grades a label inside the Reel container as strong', () => {
    renderReel();
    const context = getReelContext(document);
    const assessment = assessElementContext(byId('label'), context);
    expect(assessment.rendered).toBe(true);
    expect(assessment.inReelContainer).toBe(true);
    expect(assessment.distance).toBe(2);
    expect(assessment.score).toBeGreaterThan(0.9);
  });

  it('grades a page-level music player much lower than a Reel label', () => {
    renderReel();
    const context = getReelContext(document);
    const inside = assessElementContext(byId('label'), context);
    const outside = assessElementContext(byId('global'), context);
    expect(outside.inReelContainer).toBe(false);
    expect(outside.score).toBeLessThan(0.5);
    expect(outside.score).toBeLessThan(inside.score);
  });

  it('gives hidden and offscreen labels zero context', () => {
    renderReel();
    byId('label').style.display = 'none';
    const context = getReelContext(document);
    expect(assessElementContext(byId('label'), context).score).toBe(0);

    renderReel();
    mockRect(byId('label'), { top: -200, left: 40, width: 300, height: 24 });
    expect(assessElementContext(byId('label'), getReelContext(document)).score).toBe(0);
  });

  it('weakens labels in a shared feed container that holds several videos', () => {
    render(`
      <div id="feed">
        <div id="old">
          <video id="old-video"></video>
          <a id="old-label">Old Song · Old Artist</a>
        </div>
        <div id="current">
          <video id="current-video"></video>
          <a id="current-label">Current Song · Current Artist</a>
        </div>
      </div>
    `);
    mockRect(byId('feed'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('old'), { top: -768, left: 0, width: 1024, height: 768 });
    mockRect(byId('old-video'), { top: -768, left: 0, width: 1024, height: 768 });
    mockRect(byId('old-label'), { top: 0, left: 40, width: 300, height: 24 });
    mockRect(byId('current'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('current-video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('current-label'), { top: 600, left: 40, width: 300, height: 24 });

    const context = getReelContext(document);
    const oldScore = assessElementContext(byId('old-label'), context).score;
    const currentScore = assessElementContext(byId('current-label'), context).score;
    expect(currentScore).toBeGreaterThan(oldScore);
  });

  it('accepts a label deeply nested in the same Reel container', () => {
    // Mirrors Instagram's real DOM: the audio link can be ~28 edges from the
    // video inside a shared reel container.
    const nest = (depth: number, inner: string): string => {
      let markup = inner;
      for (let index = 0; index < depth; index += 1) markup = `<div>${markup}</div>`;
      return markup;
    };
    render(`
      <div id="reel">
        ${nest(13, '<video id="video"></video>')}
        ${nest(13, '<a id="label">Song · Artist</a>')}
      </div>
    `);
    mockRect(byId('reel'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('video'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('label'), { top: 600, left: 40, width: 300, height: 24 });

    const context = getReelContext(document);
    const assessment = assessElementContext(byId('label'), context);
    expect(assessment.distance).toBe(28);
    expect(assessment.score).toBeGreaterThan(0.9);
  });

  it('uses a visible dialog as context when no video element is available', () => {
    render('<div id="shell" role="dialog"><a id="label">Song · Artist</a></div>');
    mockRect(byId('shell'), { top: 0, left: 0, width: 1024, height: 768 });
    mockRect(byId('label'), { top: 600, left: 40, width: 300, height: 24 });

    const context = getReelContext(document);
    expect(context.video).toBeNull();
    expect(context.shell).toBe(byId('shell'));
    expect(assessElementContext(byId('label'), context).score).toBeGreaterThan(0.5);
  });
});

describe('domDistance', () => {
  it('counts parent edges through the common ancestor', () => {
    render('<div id="root"><div id="a"><div id="a1"></div></div><div id="b"></div></div>');
    expect(domDistance(byId('a1'), byId('b'))).toBe(3);
    expect(domDistance(byId('a'), byId('b'))).toBe(2);
  });
});
