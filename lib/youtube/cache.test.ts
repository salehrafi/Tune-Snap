import { describe, expect, it } from 'vitest';
import { createFakeArea } from '@/test/fakeArea';
import {
  DEFAULT_CACHE_TTL_MS,
  readSearchCache,
  searchCacheKey,
  SEARCH_CACHE_STORAGE_KEY,
  writeSearchCache,
} from './cache';
import type { YouTubeVideo } from './types';

const NOW = 1_700_000_000_000;

const VIDEO: YouTubeVideo = {
  videoId: '4NRXx6U8ABQ',
  title: 'The Weeknd - Blinding Lights (Official Video)',
  channelTitle: 'The Weeknd',
  thumbnailUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg',
  publishedAt: '2019-11-29T10:00:00Z',
};

describe('searchCacheKey', () => {
  it('treats equivalent song spellings as the same query', () => {
    expect(searchCacheKey('  Blinding   Lights! ', 'The Weeknd')).toBe(
      searchCacheKey('blinding lights', 'the weeknd'),
    );
  });

  it('keeps songs without artists separate from songs with one', () => {
    expect(searchCacheKey('Blinding Lights', null)).not.toBe(
      searchCacheKey('Blinding Lights', 'The Weeknd'),
    );
  });
});

describe('search cache', () => {
  it('writes and reads a result', async () => {
    const area = createFakeArea();
    await writeSearchCache(area, 'key', [VIDEO], { now: () => NOW });

    expect(await readSearchCache(area, 'key', { now: () => NOW + 1000 })).toEqual([VIDEO]);
  });

  it('expires entries after the TTL', async () => {
    const area = createFakeArea();
    await writeSearchCache(area, 'key', [VIDEO], { now: () => NOW });

    expect(
      await readSearchCache(area, 'key', { now: () => NOW + DEFAULT_CACHE_TTL_MS + 1 }),
    ).toBeNull();
  });

  it('returns null for an unknown key', async () => {
    const area = createFakeArea();
    await writeSearchCache(area, 'key', [VIDEO], { now: () => NOW });
    expect(await readSearchCache(area, 'other', { now: () => NOW })).toBeNull();
  });

  it('does not cache empty results', async () => {
    const area = createFakeArea();
    await writeSearchCache(area, 'key', [], { now: () => NOW });
    expect(area.data.has(SEARCH_CACHE_STORAGE_KEY)).toBe(false);
  });

  it('caps the number of cached queries, newest first', async () => {
    const area = createFakeArea();
    await writeSearchCache(area, 'one', [VIDEO], { now: () => NOW, maxEntries: 2 });
    await writeSearchCache(area, 'two', [VIDEO], { now: () => NOW + 1, maxEntries: 2 });
    await writeSearchCache(area, 'three', [VIDEO], { now: () => NOW + 2, maxEntries: 2 });

    expect(await readSearchCache(area, 'one', { now: () => NOW + 2 })).toBeNull();
    expect(await readSearchCache(area, 'two', { now: () => NOW + 2 })).not.toBeNull();
    expect(await readSearchCache(area, 'three', { now: () => NOW + 2 })).not.toBeNull();
  });

  it('updates an existing key without duplicating it', async () => {
    const area = createFakeArea();
    await writeSearchCache(area, 'key', [VIDEO], { now: () => NOW });
    await writeSearchCache(area, 'key', [{ ...VIDEO, title: 'Updated' }], { now: () => NOW + 10 });

    const entries = (area.data.get(SEARCH_CACHE_STORAGE_KEY) as { entries: unknown[] }).entries;
    expect(entries).toHaveLength(1);
    expect(await readSearchCache(area, 'key', { now: () => NOW + 10 })).toEqual([
      { ...VIDEO, title: 'Updated' },
    ]);
  });

  it('ignores malformed stored data', async () => {
    expect(await readSearchCache(createFakeArea({ [SEARCH_CACHE_STORAGE_KEY]: 'nope' }), 'key')).toBeNull();
    expect(
      await readSearchCache(
        createFakeArea({ [SEARCH_CACHE_STORAGE_KEY]: { entries: [{ key: 1, videos: 'x' }] } }),
        'key',
      ),
    ).toBeNull();
  });

  it('ignores cached videos with an invalid id', async () => {
    const area = createFakeArea({
      [SEARCH_CACHE_STORAGE_KEY]: {
        entries: [{ key: 'key', storedAt: NOW, videos: [{ ...VIDEO, videoId: 'bad' }] }],
      },
    });
    expect(await readSearchCache(area, 'key', { now: () => NOW })).toBeNull();
  });
});
