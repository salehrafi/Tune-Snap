/** Minimal YouTube video data Tune Snap keeps on a saved song. */
export interface SavedVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
}

/** Evidence used by the ranking heuristic. Never a claim of officialness. */
export type MatchSignal =
  | 'title-match'
  | 'artist-in-title'
  | 'artist-channel'
  | 'topic-channel'
  | 'vevo-channel';

export interface RankedVideo extends SavedVideo {
  publishedAt: string | null;
  score: number;
  signals: MatchSignal[];
}

export type SearchFailureReason =
  | 'missing-key'
  | 'quota-exceeded'
  | 'invalid-key'
  | 'network'
  | 'http-error'
  | 'invalid-response'
  | 'empty';

export type SongSearchResult =
  | {
      ok: true;
      query: string;
      videos: RankedVideo[];
      fromCache: boolean;
      /** True when the top result is a safe automatic choice. */
      confident: boolean;
    }
  | {
      ok: false;
      query: string;
      reason: SearchFailureReason;
      message: string;
    };

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

