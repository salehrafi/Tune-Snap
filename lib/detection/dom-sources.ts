import type { ParsedSongText } from '@/lib/adapters/types';
import {
  anchorsMatching,
  attrOf,
  musicGlyphCandidates,
  queryAll,
  textOf,
} from '@/lib/adapters/dom';
import {
  assessElementContext,
  isRendered,
  type ReelContext,
} from '@/lib/adapters/layout';
import { parseSongText } from '@/lib/adapters/parse';
import { normalizeWhitespace } from '@/lib/utils/text';
import type { EvidenceInput, EvidenceSource } from './types';

export interface DomSourceOptions {
  context: ReelContext;
  hrefFragments: readonly string[];
}

export interface DomEvidence {
  evidence: EvidenceInput[];
  /** Audio ids from visible/current links, used to validate structured data. */
  audioIds: string[];
  caption: string;
}

const MUSIC_WORD = /(?:audio|music|song|sound|track)/i;
const SEPARATOR = /[·•・|–—-]/;
const AUDIO_ID = /(?:reels?\/audio|audio)\/(\d{5,})/i;

function metaCaption(document: Document): string {
  const parts: string[] = [];
  for (const selector of [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) {
    const element = document.querySelector(selector);
    const content = element?.getAttribute('content');
    if (content) parts.push(content);
  }
  return normalizeWhitespace(parts.join(' '));
}

function overlapsVideo(element: Element, video: HTMLVideoElement): boolean {
  const elementRect = element.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();
  const width = Math.min(elementRect.right, videoRect.right) - Math.max(elementRect.left, videoRect.left);
  const height = Math.min(elementRect.bottom, videoRect.bottom) - Math.max(elementRect.top, videoRect.top);
  if (width <= 0 || height <= 0) return false;
  const area = elementRect.width * elementRect.height;
  return area <= 0 || width * height >= area * 0.15;
}

function audioIdsFromHref(href: string): string[] {
  const match = AUDIO_ID.exec(href);
  if (match?.[1]) return [match[1]];
  const numeric = /\/(\d{6,})(?:\/|$|\?)/.exec(href);
  return numeric?.[1] ? [numeric[1]] : [];
}

function toParsed(
  title: string,
  artist: string | null,
  confidence: ParsedSongText['confidence'],
): ParsedSongText {
  return { title, artist, confidence, originalAudio: false };
}

/**
 * Collect every independent DOM/accessibility signal we can associate with
 * the current Reel. Context is graded later by the engine; only clearly
 * offscreen/hidden elements are discarded here.
 */
export function collectDomEvidence(
  document: Document,
  options: DomSourceOptions,
): DomEvidence {
  const evidence: EvidenceInput[] = [];
  const audioIds = new Set<string>();
  const context = options.context;
  const isRenderedElement = (element: Element): boolean =>
    isRendered(element, context.viewport);

  const push = (
    source: EvidenceSource,
    text: string | null | undefined,
    element: Element,
    href: string | null = null,
    allowByPattern = false,
    parsedOverride?: ParsedSongText | null,
  ): void => {
    const normalized = typeof text === 'string' ? normalizeWhitespace(text) : '';
    if (!normalized && !parsedOverride) return;
    const parsed =
      parsedOverride ??
      parseSongText(normalized, {
        allowByPattern,
      });
    if (!parsed) return;
    evidence.push({
      source,
      text: normalized,
      parsed,
      element,
      href,
      allowByPattern,
      reelMatch: false,
      contextHint: 0,
      correlationKey: href ?? '',
    });
  };

  // 1. Explicit links to the track/audio page.
  for (const anchor of anchorsMatching(document, options.hrefFragments)) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    push('audio-link', textOf(anchor), anchor, href);

    const label = attrOf(anchor, 'aria-label');
    if (label) push('audio-label', label, anchor, href, true);
    const title = attrOf(anchor, 'title');
    if (title) push('title-attribute', title, anchor, href, true);

    if (isRenderedElement(anchor)) {
      const ctx = assessElementContext(anchor, context);
      if (ctx.score >= 0.35) {
        for (const id of audioIdsFromHref(href)) audioIds.add(id);
      }
    }
  }

  // 2. Accessibility metadata anywhere in the page. Context scoring later
  //    prevents page-level UI from winning; parsing filters out UI labels.
  const attributed = queryAll(
    document,
    '[aria-label], [title], [aria-description]',
  );
  let attributeBudget = 400;
  for (const element of attributed) {
    if (attributeBudget-- <= 0) break;
    for (const attribute of ['aria-label', 'title', 'aria-description'] as const) {
      const value = attrOf(element, attribute);
      if (!value || value.length > 220) continue;
      if (!MUSIC_WORD.test(value) && !(SEPARATOR.test(value) && value.length <= 110)) {
        continue;
      }
      push(
        MUSIC_WORD.test(value) ? 'audio-label' : 'title-attribute',
        value,
        element,
        null,
        true,
      );
    }
  }

  // Newer/renamed UIs sometimes expose music only through data attributes.
  for (const element of queryAll(
    document,
    '[data-testid*="music" i], [data-testid*="audio" i], [data-testid*="song" i]',
  )) {
    push('audio-label', textOf(element), element, null, false);
    const label = attrOf(element, 'aria-label') ?? attrOf(element, 'title');
    if (label) push('audio-label', label, element, null, true);
  }

  for (const attribute of ['data-audio-title', 'data-song-title', 'data-track-title']) {
    for (const element of queryAll(document, `[${attribute}]`)) {
      push('title-attribute', attrOf(element, attribute), element, null, false);
    }
  }

  for (const element of queryAll(document, 'img[alt]')) {
    const alt = attrOf(element, 'alt');
    if (!alt || alt.length > 120) continue;
    if (!MUSIC_WORD.test(alt) && !SEPARATOR.test(alt)) continue;
    push('title-attribute', alt, element, null, true);
  }

  // 3. Labels attached to the video itself or its immediate shell.
  if (context.video) {
    let node: Element | null = context.video;
    for (let depth = 0; node && depth < 6; depth += 1) {
      for (const attribute of ['aria-label', 'title'] as const) {
        const value = attrOf(node, attribute);
        if (value && (MUSIC_WORD.test(value) || SEPARATOR.test(value))) {
          push(
            MUSIC_WORD.test(value) ? 'audio-label' : 'title-attribute',
            value,
            node,
            null,
            true,
          );
        }
      }
      node = node.parentElement;
    }
  }

  // 4. Short visible labels near the Reel, even when they are plain text
  //    (no link, no aria-label, no note glyph). Requiring overlap with the
  //    video keeps ordinary captions below/outside the player from being
  //    auto-selected as a song.
  const root = context.shell ?? document.body;
  if (root) {
    const candidates = queryAll(
      root,
      'span, div, p, [role="button"], button',
    ).slice(0, 2500);
    for (const element of candidates) {
      // Never treat a container that wraps the video (and therefore all of
      // its captions/UI text) as the music label itself.
      if (context.video && element.contains(context.video)) continue;
      const text = textOf(element);
      if (!text) continue;
      const normalized = normalizeWhitespace(text);
      if (normalized.length < 3 || normalized.length > 100) continue;
      if (!SEPARATOR.test(normalized)) continue;
      if (element.childElementCount > 2) continue;
      if (assessElementContext(element, context).score < 0.25) continue;
      if (context.video && !overlapsVideo(element, context.video)) continue;
      push('visible-label', normalized, element, null, false);
    }
  }

  // 5. Music-note text (last-resort visible formatting signal).
  for (const glyph of musicGlyphCandidates(document)) {
    push('music-glyph', glyph.text, glyph.element, null, false);
  }

  // 6. Media Session metadata, when the page exposes it. This is global
  //    playback metadata, so it is deliberately weak evidence.
  if (typeof navigator !== 'undefined' && navigator.mediaSession?.metadata) {
    const metadata = navigator.mediaSession.metadata;
    const title = normalizeWhitespace(metadata.title ?? '');
    const artist = normalizeWhitespace(metadata.artist ?? '');
    if (title) {
      evidence.push({
        source: 'media-session',
        text: [title, artist].filter(Boolean).join(' · '),
        parsed: toParsed(title, artist || null, artist ? 'medium' : 'low'),
        element: null,
        href: null,
        allowByPattern: false,
        reelMatch: false,
        contextHint: 0.35,
        correlationKey: 'media-session',
      });
    }
  }

  return {
    evidence,
    audioIds: [...audioIds],
    caption: metaCaption(document),
  };
}
