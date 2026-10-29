import type { StorageArea } from '@/lib/storage/area';
import { normalizeForMatch } from '@/lib/utils/text';
import type { YouTubeVideo } from './types';

export const SEARCH_CACHE_STORAGE_KEY = 'reeltune.youtube.cache.v1';
export const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_MAX_CACHE_ENTRIES = 25;

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

interface CacheEntry {
  key: string;
  storedAt: number;
  videos: YouTubeVideo[];
}

interface CacheDatabase {
  entries: CacheEntry[];
}

export interface CacheOptions {
  ttlMs?: number;
  now?: () => number;
  maxEntries?: number;
}

/** Equivalent songs produce the same cache key. */
export function searchCacheKey(title: string, artist: string | null): string {
  return `${normalizeForMatch(title)}|${normalizeForMatch(artist ?? '')}`;
}

function isCacheableVideo(value: unknown): value is YouTubeVideo {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.videoId === 'string' &&
    VIDEO_ID.test(record.videoId) &&
    typeof record.title === 'string' &&
    record.title.length > 0 &&
    typeof record.channelTitle === 'string' &&
    (record.thumbnailUrl === null || typeof record.thumbnailUrl === 'string') &&
    (record.publishedAt === null || typeof record.publishedAt === 'string')
  );
}

function parseCache(raw: unknown): CacheEntry[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const entries = (raw as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) return [];

  const parsed: CacheEntry[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.key !== 'string' ||
      typeof record.storedAt !== 'number' ||
      !Number.isFinite(record.storedAt) ||
      !Array.isArray(record.videos)
    ) {
      continue;
    }
    const videos = record.videos.filter(isCacheableVideo);
    if (videos.length === 0) continue;
    parsed.push({ key: record.key, storedAt: record.storedAt, videos });
  }
  return parsed;
}

export async function readSearchCache(
  area: StorageArea,
  key: string,
  options: CacheOptions = {},
): Promise<YouTubeVideo[] | null> {
  const ttl = options.ttlMs ?? DEFAULT_CACHE_TTL_MS;
  const now = options.now?.() ?? Date.now();
  const entries = parseCache(await area.get(SEARCH_CACHE_STORAGE_KEY));
  const match = entries.find((entry) => entry.key === key);
  if (!match) return null;
  if (now - match.storedAt > ttl) return null;
  return match.videos;
}

export async function writeSearchCache(
  area: StorageArea,
  key: string,
  videos: readonly YouTubeVideo[],
  options: CacheOptions = {},
): Promise<void> {
  if (videos.length === 0) return;
  const now = options.now?.() ?? Date.now();
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;

  const entries = parseCache(await area.get(SEARCH_CACHE_STORAGE_KEY)).filter(
    (entry) => entry.key !== key,
  );
  entries.unshift({ key, storedAt: now, videos: [...videos] });

  const database: CacheDatabase = { entries: entries.slice(0, maxEntries) };
  await area.set(SEARCH_CACHE_STORAGE_KEY, database);
}
