import { MUSIC_GLYPH } from './glyphs';

/** Run a selector, returning an empty list instead of throwing on bad markup. */
export function queryAll(root: ParentNode, selector: string): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch {
    return [];
  }
}

export function textOf(element: Element): string | null {
  const text = element.textContent;
  return typeof text === 'string' && text.trim().length > 0 ? text : null;
}

export function attrOf(element: Element, name: string): string | null {
  const value = element.getAttribute(name);
  return value && value.trim().length > 0 ? value : null;
}

/** Anchors whose `href` contains one of the given path fragments. */
export function anchorsMatching(root: ParentNode, hrefFragments: readonly string[]): Element[] {
  return queryAll(root, 'a[href]').filter((anchor) => {
    const href = anchor.getAttribute('href');
    if (!href) return false;
    return hrefFragments.some((fragment) => href.includes(fragment));
  });
}

export interface MusicGlyphCandidate {
  text: string;
  element: Element;
}

/**
 * Find short pieces of text that contain a music note.
 *
 * Only leaf elements, or elements whose *own* text contains the note, are
 * returned. This avoids returning a large page container whose text merely
 * includes a nested label. Visibility and Reel context are graded later by the
 * detection engine.
 */
export function musicGlyphCandidates(
  root: ParentNode,
  limit = 4000,
): MusicGlyphCandidate[] {
  const elements = queryAll(root, 'span, div, a, [role="button"]');
  const candidates: MusicGlyphCandidate[] = [];

  for (let index = 0; index < elements.length && index < limit; index += 1) {
    const element = elements[index];
    if (!element) continue;

    const text = element.textContent;
    if (!text || text.length > 160) continue;
    if (!MUSIC_GLYPH.test(text)) continue;

    if (element.childElementCount > 0) {
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? '')
        .join(' ');
      if (!MUSIC_GLYPH.test(ownText)) continue;
    }

    candidates.push({ text, element });
  }

  return candidates;
}
