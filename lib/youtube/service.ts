import type { StorageArea } from '@/lib/storage/area';
import type { SongSearchResult } from '@/lib/types/youtube';
import { readSearchCache, searchCacheKey, writeSearchCache } from './cache';
import { fetchYouTubeVideos } from './client';
import { buildSearchQuery, isConfidentMatch, rankVideos, type SongQuery } from './matching';
import type { FetchLike } from './types';

export interface SearchDeps {
  apiKey: string | null;
  fetchImpl?: FetchLike;
  /** Session storage area; pass null to disable caching. */
  cache?: StorageArea | null;
  now?: () => number;
}

/**
 * Search YouTube for a song, reusing a recent result for an equivalent query
 * when available. Network and API failures are returned as values, so the
 * popup can offer a graceful fallback without breaking the wishlist.
 */
export async function searchForSong(
  song: SongQuery,
  deps: SearchDeps,
): Promise<SongSearchResult> {
  const title = song.title.trim();
  const artist = song.artist?.trim() || null;
  const query = buildSearchQuery({ title, artist });
  if (!title) throw new Error('A song title is required to search YouTube.');

  if (!deps.apiKey) {
    return {
      ok: false,
      query,
      reason: 'missing-key',
      message: 'Add a YouTube Data API key in Settings to search inside Tune Snap.',
    };
  }

  const now = deps.now ?? Date.now;
  const cacheKey = searchCacheKey(title, artist);
  const cache = deps.cache ?? null;

  if (cache) {
    const cached = await readSearchCache(cache, cacheKey, { now }).catch(() => null);
    if (cached) {
      const videos = rankVideos(cached, { title, artist });
      if (videos.length > 0) {
        return {
          ok: true,
          query,
          videos,
          fromCache: true,
          confident: isConfidentMatch(videos),
        };
      }
    }
  }

  const response = await fetchYouTubeVideos(query, {
    apiKey: deps.apiKey,
    fetchImpl: deps.fetchImpl,
  });

  if (!response.ok) {
    return { ok: false, query, reason: response.reason, message: response.message };
  }

  if (response.videos.length === 0) {
    return {
      ok: false,
      query,
      reason: 'empty',
      message: 'No YouTube videos matched this song. Try editing the title or artist.',
    };
  }

  if (cache) {
    await writeSearchCache(cache, cacheKey, response.videos, { now }).catch(() => undefined);
  }

  const videos = rankVideos(response.videos, { title, artist });
  return {
    ok: true,
    query,
    videos,
    fromCache: false,
    confident: isConfidentMatch(videos),
  };
}

