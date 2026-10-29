import { describe, expect, it } from 'vitest';
import type { WishlistItem } from '@/lib/types/wishlist';
import { filterWishlist } from './wishlist-filter';

const NOW = 1_700_000_000_000;

function item(overrides: Partial<WishlistItem>): WishlistItem {
  return {
    id: 'id',
    title: 'Song',
    artist: null,
    source: 'instagram',
    reelUrl: null,
    metadataOrigin: 'detected',
    createdAt: NOW,
    updatedAt: NOW,
    video: null,
    ...overrides,
  };
}

const ITEMS: WishlistItem[] = [
  item({ id: '1', title: 'Blinding Lights', artist: 'The Weeknd' }),
  item({ id: '2', title: 'Halo', artist: 'Beyoncé' }),
  item({ id: '3', title: 'Flowers', artist: 'Miley Cyrus' }),
];

describe('filterWishlist', () => {
  it('returns everything for an empty query', () => {
    expect(filterWishlist(ITEMS, '   ')).toHaveLength(3);
  });

  it('matches titles case-insensitively', () => {
    expect(filterWishlist(ITEMS, 'BLINDING').map((entry) => entry.id)).toEqual(['1']);
  });

  it('matches artists and ignores accents', () => {
    expect(filterWishlist(ITEMS, 'beyonce').map((entry) => entry.id)).toEqual(['2']);
  });

  it('matches partial words and multiple words', () => {
    expect(filterWishlist(ITEMS, 'miley cyr').map((entry) => entry.id)).toEqual(['3']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(filterWishlist(ITEMS, 'zzz')).toEqual([]);
  });

  it('handles items without an artist', () => {
    const items = [item({ id: '4', title: 'Unknown Track', artist: null })];
    expect(filterWishlist(items, 'unknown')).toHaveLength(1);
    expect(filterWishlist(items, 'weeknd')).toEqual([]);
  });
});
