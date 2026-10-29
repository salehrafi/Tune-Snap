import type { ParsedSongText } from '@/lib/adapters/types';

/**
 * Where a piece of music evidence came from.
 *
 * These are deliberately explicit and finite: the scoring model is a
 * transparent weighted ensemble, not a trained classifier.
 */
export type EvidenceSource =
  | 'structured-music'
  | 'audio-link'

  | 'audio-label'
  | 'title-attribute'
  | 'visible-label'
  | 'music-glyph'
  | 'media-session';

export interface EvidenceInput {
  source: EvidenceSource;
  /** Normalized visible/accessible text. */
  text: string;
  /** Pre-parsed values for structured data; otherwise the engine parses text. */
  parsed?: ParsedSongText | null;
  /** Element the evidence was read from, when applicable. */
  element?: Element | null;
  /** Audio/music URL, used to correlate link text with its own aria-label. */
  href?: string | null;
  /** Allow "Title by Artist" parsing for accessible labels. */
  allowByPattern?: boolean;
  /** Structured record was tied to the current Reel/audio id. */
  reelMatch?: boolean;
  /** Context strength for evidence without an element (structured/media). */
  contextHint?: number;
  /** Correlation key for structured records or other non-element sources. */
  correlationKey?: string;
}

export interface Evidence extends EvidenceInput {
  parsed: ParsedSongText | null;
  element: Element | null;
  href: string | null;
  allowByPattern: boolean;
  reelMatch: boolean;
  contextHint: number;
  correlationKey: string;
}
