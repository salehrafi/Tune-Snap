import { describe, expect, it, vi } from 'vitest';
import { createFakeArea } from '@/test/fakeArea';
import type { StorageArea } from '@/lib/storage/area';
import { searchCacheKey, SEARCH_CACHE_STORAGE_KEY, writeSearchCache } from './cache';
import { searchForSong } from './service';
import type { YouTubeVideo } from './types';

const NOW = 1_700_000_000_000;
const SONG = { title: 'Blinding Lights', artist: 'The Weeknd' };

const VIDEO: YouTubeVideo = {
  videoId: '4NRXx6U8ABQ',
  title: 'The Weeknd - Blinding Lights (Official Video)',
  channelTitle: 'The Weeknd',
  thumbnailUrl: null,
  publishedAt: null,
};

const API_ITEM = {
  id: { videoId: VIDEO.videoId },
  snippet: {
    title: VIDEO.title,
    channelTitle: VIDEO.channelTitle,
    publishedAt: '2019-11-29T10:00:00Z',
    thumbnails: {},
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function okFetch() {
  return vi.fn(async () => jsonResponse({ items: [API_ITEM] }));
}

describe('searchForSong', () => {
  it('returns a missing-key result without calling the network', async () => {
    const fetchImpl = okFetch();
    const result = await searchForSong(SONG, { apiKey: null, fetchImpl });

    expect(result).toMatchObject({ ok: false, reason: 'missing-key' });
    expect(result.query).toBe('The Weeknd Blinding Lights');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('searches, ranks, and caches successful results', async () => {
    const cache = createFakeArea();
    const fetchImpl = okFetch();

    const result = await searchForSong(SONG, {
      apiKey: 'k',
      fetchImpl,
      cache,
      now: () => NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fromCache).toBe(false);
    expect(result.confident).toBe(true);
    expect(result.videos[0]?.videoId).toBe(VIDEO.videoId);
    expect(cache.data.has(SEARCH_CACHE_STORAGE_KEY)).toBe(true);
  });

  it('reuses a cached result instead of calling YouTube again', async () => {
    const cache = createFakeArea();
    await writeSearchCache(cache, searchCacheKey(SONG.title, SONG.artist), [VIDEO], {
      now: () => NOW,
    });
    const fetchImpl = vi.fn(async () => {
      throw new Error('network should not be called');
    });

    const result = await searchForSong(SONG, {
      apiKey: 'k',
      fetchImpl,
      cache,
      now: () => NOW + 5000,
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fromCache).toBe(true);
  });

  it('reports empty results', async () => {
    const result = await searchForSong(SONG, {
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ items: [] }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'empty' });
  });

  it('passes through quota errors', async () => {
    const result = await searchForSong(SONG, {
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse(
          { error: { status: 'RESOURCE_EXHAUSTED', errors: [{ reason: 'quotaExceeded' }] } },
          403,
        ),
    });

    expect(result).toMatchObject({ ok: false, reason: 'quota-exceeded' });
  });

  it('still returns results when the cache cannot be read or written', async () => {
    const failing: StorageArea = {
      get: async () => {
        throw new Error('cache read failed');
      },
      set: async () => {
        throw new Error('cache write failed');
      },
      remove: async () => undefined,
    };

    const result = await searchForSong(SONG, {
      apiKey: 'k',
      fetchImpl: okFetch(),
      cache: failing,
      now: () => NOW,
    });

    expect(result.ok).toBe(true);
  });

  it('works without a cache area at all', async () => {
    const result = await searchForSong(SONG, {
      apiKey: 'k',
      fetchImpl: okFetch(),
      cache: null,
    });

    expect(result.ok).toBe(true);
  });
});
