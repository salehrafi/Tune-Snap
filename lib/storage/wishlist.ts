import { cleanArtist, wishlistIdentity } from '@/lib/utils/identity';
import { normalizeWhitespace } from '@/lib/utils/text';
import type {
  AddWishlistResult,
  NewWishlistItem,
  WishlistDatabase,
  WishlistItem,
  WishlistSnapshot,
} from '@/lib/types/wishlist';
import { WISHLIST_SCHEMA_VERSION } from '@/lib/types/wishlist';
import type { StorageArea } from './area';

export const WISHLIST_STORAGE_KEY = 'reeltune.wishlist.v1';

const SOURCES = new Set(['instagram', 'manual']);
const ORIGINS = new Set(['detected', 'manual', 'edited']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function asReelUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function asVideo(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const videoId = typeof record.videoId === 'string' ? record.videoId : '';
  if (!VIDEO_ID.test(videoId)) return null;
  const title = typeof record.title === 'string' ? normalizeWhitespace(record.title) : '';
  if (!title) return null;
  const channelTitle =
    typeof record.channelTitle === 'string' ? normalizeWhitespace(record.channelTitle) : '';
  return {
    videoId,
    title,
    channelTitle,
    thumbnailUrl: asReelUrl(record.thumbnailUrl),
  };
}

function sanitizeItem(value: unknown, now: number): WishlistItem | null {
  const record = asRecord(value);
  if (!record) return null;

  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const title = typeof record.title === 'string' ? normalizeWhitespace(record.title) : '';
  if (!id || !title) return null;

  const artist = typeof record.artist === 'string' ? cleanArtist(record.artist) : null;
  const source = typeof record.source === 'string' && SOURCES.has(record.source)
    ? (record.source as WishlistItem['source'])
    : 'manual';
  const metadataOrigin =
    typeof record.metadataOrigin === 'string' && ORIGINS.has(record.metadataOrigin)
      ? (record.metadataOrigin as WishlistItem['metadataOrigin'])
      : 'manual';
  const createdAt = asTimestamp(record.createdAt, now);
  const updatedAt = asTimestamp(record.updatedAt, createdAt);

  return {
    id,
    title,
    artist,
    source,
    reelUrl: asReelUrl(record.reelUrl),
    metadataOrigin,
    createdAt,
    updatedAt,
    video: asVideo(record.video),
  };
}

function sortNewestFirst(items: WishlistItem[]): WishlistItem[] {
  return [...items].sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Parse whatever is in storage into a valid list. Handles the v1 envelope, a
 * bare array from early builds, a single item object, and stringified JSON.
 * Invalid entries are dropped instead of crashing the popup.
 */
export function parseWishlist(raw: unknown, now: number = Date.now()): WishlistSnapshot {
  if (raw === undefined || raw === null || raw === '') {
    return { items: [], repaired: false };
  }

  let candidate = raw;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return { items: [], repaired: true };
    }
  }

  let rawItems: unknown[] = [];
  let storedVersion = 0;

  if (Array.isArray(candidate)) {
    rawItems = candidate;
  } else {
    const record = asRecord(candidate);
    if (!record) return { items: [], repaired: true };
    if (typeof record.schemaVersion === 'number') storedVersion = record.schemaVersion;
    if (Array.isArray(record.items)) {
      rawItems = record.items;
    } else if (typeof record.title === 'string') {
      rawItems = [record];
    } else {
      return { items: [], repaired: true };
    }
  }

  let repaired = storedVersion !== WISHLIST_SCHEMA_VERSION;
  const items: WishlistItem[] = [];
  const ids = new Set<string>();
  const identities = new Set<string>();

  for (const rawItem of rawItems) {
    const item = sanitizeItem(rawItem, now);
    if (!item) {
      repaired = true;
      continue;
    }
    if (ids.has(item.id)) {
      repaired = true;
      continue;
    }
    const identity = wishlistIdentity(item.title, item.artist);
    if (identities.has(identity)) {
      repaired = true;
      continue;
    }
    ids.add(item.id);
    identities.add(identity);
    items.push(item);
  }

  return { items: sortNewestFirst(items), repaired };
}

export async function loadWishlist(
  area: StorageArea,
  now: number = Date.now(),
): Promise<WishlistSnapshot> {
  const raw = await area.get(WISHLIST_STORAGE_KEY);
  return parseWishlist(raw, now);
}

async function persist(area: StorageArea, items: WishlistItem[]): Promise<void> {
  const database: WishlistDatabase = {
    schemaVersion: WISHLIST_SCHEMA_VERSION,
    items,
  };
  await area.set(WISHLIST_STORAGE_KEY, database);
}

function createId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Save a song. Duplicates are matched on normalized title + artist, so
 * different versions (remix, live, sped up, ...) stay separate.
 */
export async function addWishlistItem(
  area: StorageArea,
  input: NewWishlistItem,
  now: number = Date.now(),
): Promise<AddWishlistResult> {
  const title = normalizeWhitespace(input.title);
  if (!title) throw new Error('A song title is required.');

  const artist = cleanArtist(input.artist);
  const snapshot = await loadWishlist(area, now);
  const identity = wishlistIdentity(title, artist);
  const existing = snapshot.items.find(
    (item) => wishlistIdentity(item.title, item.artist) === identity,
  );

  if (existing) {
    // A user who saved first and picked a video later should not get a second
    // item; fill in the missing match on the existing one.
    if (!existing.video && input.video) {
      const updated: WishlistItem = { ...existing, video: input.video, updatedAt: now };
      await persist(
        area,
        snapshot.items.map((item) => (item.id === updated.id ? updated : item)),
      );
      return { status: 'duplicate', item: updated, attachedVideo: true };
    }
    return { status: 'duplicate', item: existing, attachedVideo: false };
  }

  const item: WishlistItem = {
    id: createId(),
    title,
    artist,
    source: input.source,
    reelUrl: asReelUrl(input.reelUrl),
    metadataOrigin: input.metadataOrigin,
    createdAt: now,
    updatedAt: now,
    video: asVideo(input.video),
  };

  await persist(area, [item, ...snapshot.items]);
  return { status: 'added', item };
}

export async function removeWishlistItem(area: StorageArea, id: string): Promise<boolean> {
  const snapshot = await loadWishlist(area);
  const remaining = snapshot.items.filter((item) => item.id !== id);
  if (remaining.length === snapshot.items.length) return false;
  await persist(area, remaining);
  return true;
}
