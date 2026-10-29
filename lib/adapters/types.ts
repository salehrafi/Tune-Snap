import type { DetectedTrack, DetectionConfidence, SocialPlatform } from '@/lib/types/song';

export type ExtractionReason =
  | 'detected'
  | 'no-metadata'
  | 'original-audio'
  | 'ambiguous';

export interface DetectionDiagnostics {
  /** Winning group's transparent weighted score (0..1). */
  score: number;
  /** Next-best song group's score, when one exists. */
  runnerUp: number | null;
  /** score - runnerUp. */
  margin: number;
  /** Evidence sources behind the winning group. */
  sources: string[];
  /** Count of independent (de-correlated) evidence clusters. */
  clusters: number;
  /** Total parsed evidence items considered. */
  evidence: number;
  /** Reel-context strength of the winning evidence (0..1). */
  context: number;
}

export interface ParsedSongText {
  title: string;
  artist: string | null;
  confidence: DetectionConfidence;
  originalAudio: boolean;
}

export interface ExtractionResult {
  track: DetectedTrack | null;
  reason: ExtractionReason;
  reelUrl: string | null;
  diagnostics?: DetectionDiagnostics;
}

export interface SiteAdapter {
  platform: SocialPlatform;
  matches(url: URL): boolean;
  isReel(url: URL): boolean;
  reelUrl(url: URL): string | null;
  extract(document: Document, url: URL): ExtractionResult;
}
