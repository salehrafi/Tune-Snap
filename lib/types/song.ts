/**
 * Domain types for a song captured from a Reel.
 *
 * `origin` is deliberately stored on every song so the UI (and future
 * consumers) can distinguish automatically detected values from anything the
 * user typed or corrected by hand. Nothing here invents metadata.
 */

export const SOCIAL_PLATFORMS = ['instagram'] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Where a song came from. `manual` is used when the user typed it themselves. */
export type SongSource = SocialPlatform | 'manual';

/** How the title/artist values were obtained. */
export type MetadataOrigin = 'detected' | 'manual' | 'edited';

/** How strongly the adapter trusts the values it parsed out of the page. */
export type DetectionConfidence = 'high' | 'medium' | 'low';

/** Values parsed out of a Reel page by a site adapter. */
export interface DetectedTrack {
  title: string;
  artist: string | null;
  confidence: DetectionConfidence;
  /** True when the page only shows "Original audio" and no song name. */
  originalAudio: boolean;
  /** Short identifier of the extraction strategy that won, for debugging. */
  evidence: string;
}

/** Editable song state used by the popup. */
export interface SongDraft {
  title: string;
  /** Empty string when the artist is unknown; stored as `null`. */
  artist: string;
  source: SongSource;
  reelUrl: string | null;
  origin: MetadataOrigin;
  confidence: DetectionConfidence | null;
}
