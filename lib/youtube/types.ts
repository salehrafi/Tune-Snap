import type { SavedVideo } from '@/lib/types/youtube';

/** Raw video data exactly as returned by the YouTube search endpoint. */
export interface YouTubeVideo extends SavedVideo {
  publishedAt: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
