/**
 * Geometry and visibility helpers used to associate a music label with the
 * Reel that is actually on screen.
 *
 * Both platforms keep preloaded/previous Reels mounted in the DOM. Without
 * these checks, the first music link in document order can belong to a Reel
 * that is hidden, offscreen, or otherwise not the one the user is watching —
 * which is how a stale song used to be reported on every Reel.
 */

export interface Viewport {
  width: number;
  height: number;
}

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}



export function currentViewport(): Viewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  return {
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  };
}

export function elementRect(element: Element): Rect | null {
  if (typeof element.getBoundingClientRect !== 'function') return null;

  let measured: DOMRect;
  try {
    measured = element.getBoundingClientRect();
  } catch {
    return null;
  }

  const left = Number(measured.left);
  const top = Number(measured.top);
  const width = Number(measured.width);
  const height = Number(measured.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  return { left, top, width, height, right: left + width, bottom: top + height };
}

function computedStyle(element: Element): CSSStyleDeclaration | null {
  const view = element.ownerDocument.defaultView;
  if (!view) return null;
  try {
    return view.getComputedStyle(element);
  } catch {
    return null;
  }
}

function isHiddenStyle(style: { display: string; visibility: string; opacity: string }): boolean {
  if (style.display === 'none') return true;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return true;
  const opacity = style.opacity.trim();
  return opacity !== '' && Number(opacity) === 0;
}

/**
 * True when the element and all of its ancestors are rendered and at least
 * partially inside the viewport. Hidden preloaded Reels fail this check.
 */
export function isRendered(
  element: Element,
  viewport: Viewport = currentViewport(),
): boolean {
  if (!element.isConnected) return false;
  if (viewport.width <= 0 || viewport.height <= 0) return false;

  const document = element.ownerDocument;
  let node: Element | null = element;
  let depth = 0;
  while (node && node !== document.documentElement && depth < 50) {
    if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    // Inline styles are checked explicitly so this also works in environments
    // without a layout engine (tests) and for detached documents.
    const inline = (node as HTMLElement).style;
    if (inline && isHiddenStyle(inline)) return false;

    const style = computedStyle(node);
    if (style && isHiddenStyle(style)) return false;

    node = node.parentElement;
    depth += 1;
  }

  const rect = elementRect(element);
  if (!rect) return false;
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < viewport.height &&
    rect.left < viewport.width
  );
}

export function intersectionArea(rect: Rect, viewport: Viewport): number {
  const width = Math.min(rect.right, viewport.width) - Math.max(rect.left, 0);
  const height = Math.min(rect.bottom, viewport.height) - Math.max(rect.top, 0);
  return width > 0 && height > 0 ? width * height : 0;
}

export function visibleRatio(rect: Rect, viewport: Viewport): number {
  const area = rect.width * rect.height;
  if (area <= 0) return 0;
  return intersectionArea(rect, viewport) / area;
}

function rectsNear(a: Rect, b: Rect, margin: number): boolean {
  return (
    a.left <= b.right + margin &&
    a.right >= b.left - margin &&
    a.top <= b.bottom + margin &&
    a.bottom >= b.top - margin
  );
}

export interface ReelContext {
  document: Document;
  video: HTMLVideoElement | null;
  /** A visible dialog/article/main that represents the Reel shell, if any. */
  shell: Element | null;
  viewport: Viewport;
}

export interface ElementContext {
  rendered: boolean;
  /** Fraction of the element's box inside the viewport. */
  visibility: number;
  nearVideo: boolean;
  inReelContainer: boolean;
  distance: number | null;
  /** 0..1 context strength used by the evidence engine. */
  score: number;
}

function largestVisible(
  document: Document,
  selector: string,
  viewport: Viewport,
): Element | null {
  let best: Element | null = null;
  let bestArea = 0;
  for (const element of Array.from(document.querySelectorAll(selector))) {
    if (!isRendered(element, viewport)) continue;
    const rect = elementRect(element);
    if (!rect) continue;
    const area = intersectionArea(rect, viewport);
    if (area > bestArea) {
      bestArea = area;
      best = element;
    }
  }
  return best;
}

export function getReelContext(
  document: Document,
  viewport: Viewport = currentViewport(),
): ReelContext {
  const video = findActiveVideo(document, viewport);
  const shellSelector = '[role="dialog"], article, main, [role="main"]';
  let shell: Element | null = video?.closest(shellSelector) ?? null;
  if (!shell) {
    shell = largestVisible(document, shellSelector, viewport);
  }
  return { document, video, shell, viewport };
}

/**
 * Context strength for an element. Unlike a hard filter, this grades how
 * strongly the element belongs to the visible Reel. A portal or sidebar label
 * can still contribute with lower weight, while hidden/offscreen preloaded
 * Reels score zero.
 */
export function assessElementContext(
  element: Element,
  context: ReelContext,
): ElementContext {
  const empty: ElementContext = {
    rendered: false,
    visibility: 0,
    nearVideo: false,
    inReelContainer: false,
    distance: null,
    score: 0,
  };

  if (!isRendered(element, context.viewport)) return empty;
  const rect = elementRect(element);
  if (!rect) return empty;

  const visibility = visibleRatio(rect, context.viewport);
  const visibilityFactor = 0.7 + 0.3 * Math.min(1, visibility / 0.5);
  const inShell = context.shell?.contains(element) === true;

  if (!context.video) {
    return {
      rendered: true,
      visibility,
      nearVideo: false,
      inReelContainer: inShell,
      distance: null,
      score: (inShell ? 0.55 : 0.28) * visibilityFactor,
    };
  }

  const videoRect = elementRect(context.video);
  if (!videoRect) {
    return {
      rendered: true,
      visibility,
      nearVideo: false,
      inReelContainer: inShell,
      distance: null,
      score: (inShell ? 0.5 : 0.25) * visibilityFactor,
    };
  }

  const common = commonAncestor(element, context.video);
  const document = element.ownerDocument;
  const inReelContainer = Boolean(
    common && common !== document.body && common !== document.documentElement,
  );
  const margin = Math.max(240, Math.min(480, context.viewport.width * 0.3));
  const nearVideo = rectsNear(rect, videoRect, margin);
  const distance = domDistance(element, context.video);
  const shellHasBoth = inShell && context.shell?.contains(context.video) === true;
  // A shared feed/list container holding several videos is weaker evidence
  // than a container that holds only the active Reel. This prevents a visible
  // label from a neighboring Reel in the same carousel from tying the score.
  const videosInCommon = common ? common.querySelectorAll('video').length : 0;

  let association: number;
  if (inReelContainer) {
    association = nearVideo
      ? videosInCommon <= 1
        ? 1
        : 0.72
      : 0.6;
  } else if (shellHasBoth) {
    association = 0.55;
  } else if (nearVideo) {
    association = 0.42;
  } else {
    association = 0.2;
  }

  return {
    rendered: true,
    visibility,
    nearVideo,
    inReelContainer,
    distance: Number.isFinite(distance) ? distance : null,
    score: association * visibilityFactor,
  };
}

export function commonAncestor(a: Element, b: Element): Element | null {
  const ancestors = new Set<Element>();
  let node: Element | null = a;
  while (node) {
    ancestors.add(node);
    node = node.parentElement;
  }

  node = b;
  while (node) {
    if (ancestors.has(node)) return node;
    node = node.parentElement;
  }
  return null;
}

/** Number of parent edges between two elements via their common ancestor. */
export function domDistance(a: Element, b: Element): number {
  const ancestors = new Map<Element, number>();
  let depth = 0;
  let node: Element | null = a;
  while (node) {
    ancestors.set(node, depth);
    depth += 1;
    node = node.parentElement;
  }

  depth = 0;
  node = b;
  while (node) {
    const fromA = ancestors.get(node);
    if (fromA !== undefined) return fromA + depth;
    depth += 1;
    node = node.parentElement;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * Pick the video that represents the Reel currently on screen: visible,
 * largest, closest to the viewport centre, and preferably playing.
 */
export function findActiveVideo(
  document: Document,
  viewport: Viewport = currentViewport(),
): HTMLVideoElement | null {
  if (viewport.width <= 0 || viewport.height <= 0) return null;

  const videos = Array.from(document.querySelectorAll('video'));
  let best: HTMLVideoElement | null = null;
  let bestScore = 0;

  for (const video of videos) {
    if (!isRendered(video, viewport)) continue;
    const rect = elementRect(video);
    if (!rect) continue;

    const area = intersectionArea(rect, viewport);
    if (area <= 0) continue;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distanceFromCenter = Math.hypot(
      centerX - viewport.width / 2,
      centerY - viewport.height / 2,
    );
    const maxDimension = Math.max(viewport.width, viewport.height, 1);
    const centerFactor = 1 + Math.max(0, 1 - distanceFromCenter / maxDimension) * 0.35;
    const playingFactor = video.paused || video.ended ? 1 : 1.2;

    const score = area * centerFactor * playingFactor;
    if (score > bestScore) {
      bestScore = score;
      best = video;
    }
  }

  return best;
}


