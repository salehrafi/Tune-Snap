import type { EvidenceSource } from './types';

/**
 * Initial, transparent source reliability weights.
 *
 * These are engineering priors, not probabilities produced by a trained model.
 * They are intentionally ordered by how directly the source represents the
 * current Reel's licensed track:
 *
 * 1. structured current-Reel music record
 * 2. explicit audio/music link to the track
 * 3. accessible label describing that audio
 * 4. generic title attribute
 * 5. visible short label near the video
 * 6. music-note text (strong formatting, but can be caption text)
 * 7. Media Session metadata (global playback, not Reel-scoped)
 */
export const SOURCE_WEIGHTS: Record<EvidenceSource, number> = {
  'structured-music': 0.92,
  'audio-link': 0.86,
  'audio-label': 0.68,
  'title-attribute': 0.62,
  'visible-label': 0.62,
  'music-glyph': 0.64,
  'media-session': 0.4,
};

/** Sources strong enough to justify high confidence on their own. */
export const STRONG_SOURCES: ReadonlySet<EvidenceSource> = new Set([
  'structured-music',
  'audio-link',
]);

export function sourceWeight(source: EvidenceSource): number {
  return SOURCE_WEIGHTS[source];
}

export function isStrongSource(source: EvidenceSource): boolean {
  return STRONG_SOURCES.has(source);
}
