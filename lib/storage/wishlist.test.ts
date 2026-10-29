import { describe, expect, it } from 'vitest';
import { createFakeArea } from '@/test/fakeArea';
import type { StorageArea } from './area';
import type { NewWishlistItem, WishlistItem } from '@/lib/types/wishlist';
import {
  addWishlistItem,
  loadWishlist,
  parseWishlist,
  removeWishlistItem,
  WISHLIST_STORAGE_KEY,
} from './wishlist';

const NOW = 1_700_000_000_000;

const VIDEO = {
  videoId: '4NRXx6U8ABQ',
  title: 'The Weeknd - Blinding Lights (Official Video)',
  channelTitle: 'The Weeknd',
  thumbnailUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg',
};

function song(overrides: Partial<NewWishlistItem> = {}): NewWishlistItem {
  return {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    source: 'instagram',
    reelUrl: 'https://www.instagram.com/reel/ABC123/',
    metadataOrigin: 'detected',
    video: null,
    ...overrides,
  };
}

function validItem(overrides: Partial<WishlistItem> = {}): Record<string, unknown> {
  return {
    id: 'item-1',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    source: 'instagram',
    reelUrl: 'https://www.instagram.com/reel/ABC123/',
    metadataOrigin: 'detected',
    createdAt: NOW,
    updatedAt: NOW,
    video: null,
    ...overrides,
  };
}

describe('addWishlistItem', () => {
  it('persists a complete item and reloads it', async () => {
    const area = createFakeArea();
    const result = await addWishlistItem(area, song(), NOW);

    expect(result.status).toBe('added');

    const snapshot = await loadWishlist(area, NOW);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      source: 'instagram',
      reelUrl: 'https://www.instagram.com/reel/ABC123/',
      metadataOrigin: 'detected',
      createdAt: NOW,
      updatedAt: NOW,
      video: null,
    });
    expect(snapshot.items[0]?.id).toMatch(/[a-z0-9-]{8,}/i);
  });

  it('saves the selected YouTube video', async () => {
    const area = createFakeArea();
    await addWishlistItem(area, song({ video: VIDEO }), NOW);

    const snapshot = await loadWishlist(area, NOW);
    expect(snapshot.items[0]?.video).toEqual(VIDEO);
  });

  it('rejects a blank title', async () => {
    const area = createFakeArea();
    await expect(addWishlistItem(area, song({ title: '   ' }), NOW)).rejects.toThrow(/title/i);
  });

  it('drops unsafe Reel URLs instead of storing them', async () => {
    const area = createFakeArea();
    await addWishlistItem(area, song({ reelUrl: 'javascript:alert(1)' }), NOW);

    const snapshot = await loadWishlist(area, NOW);
    expect(snapshot.items[0]?.reelUrl).toBeNull();
  });

  it('stores the newest song first', async () => {
    const area = createFakeArea();
    await addWishlistItem(area, song({ title: 'First Song' }), NOW);
    await addWishlistItem(area, song({ title: 'Second Song' }), NOW + 10);

    const snapshot = await loadWishlist(area, NOW + 10);
    expect(snapshot.items.map((item) => item.title)).toEqual(['Second Song', 'First Song']);
  });
});

describe('duplicate detection', () => {
  it('treats normalized casing, spacing and punctuation as the same song', async () => {
    const area = createFakeArea();
    const first = await addWishlistItem(area, song(), NOW);
    const second = await addWishlistItem(
      area,
      song({ title: '  blinding   lights! ', artist: 'the weeknd' }),
      NOW + 1,
    );

    expect(first.status).toBe('added');
    expect(second.status).toBe('duplicate');
    if (second.status === 'duplicate' && first.status === 'added') {
      expect(second.item.id).toBe(first.item.id);
      expect(second.attachedVideo).toBe(false);
    }

    const snapshot = await loadWishlist(area, NOW + 1);
    expect(snapshot.items).toHaveLength(1);
  });

  it('keeps remixes, live versions and sped-up versions as separate items', async () => {
    const area = createFakeArea();
    await addWishlistItem(area, song(), NOW);
    await addWishlistItem(area, song({ title: 'Blinding Lights (Remix)' }), NOW + 1);
    await addWishlistItem(area, song({ title: 'Blinding Lights - Live' }), NOW + 2);
    await addWishlistItem(area, song({ title: 'Blinding Lights (Sped Up)' }), NOW + 3);

    const snapshot = await loadWishlist(area, NOW + 3);
    expect(snapshot.items).toHaveLength(4);
  });

  it('attaches a YouTube match to an existing item saved without one', async () => {
    const area = createFakeArea();
    const first = await addWishlistItem(area, song(), NOW);
    const second = await addWishlistItem(area, song({ video: VIDEO }), NOW + 5);

    expect(second.status).toBe('duplicate');
    if (first.status !== 'added' || second.status !== 'duplicate') return;

    expect(second.attachedVideo).toBe(true);
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.video).toEqual(VIDEO);
    expect(second.item.updatedAt).toBe(NOW + 5);

    const snapshot = await loadWishlist(area, NOW + 5);
    expect(snapshot.items[0]?.video).toEqual(VIDEO);
  });

  it('does not overwrite an existing YouTube match', async () => {
    const area = createFakeArea();
    await addWishlistItem(area, song({ video: VIDEO }), NOW);
    const other = await addWishlistItem(
      area,
      song({ video: { ...VIDEO, videoId: 'dQw4w9WgXcQ' } }),
      NOW + 5,
    );

    expect(other.status).toBe('duplicate');
    if (other.status !== 'duplicate') return;
    expect(other.attachedVideo).toBe(false);
    expect(other.item.video?.videoId).toBe(VIDEO.videoId);
  });
});

describe('removeWishlistItem', () => {
  it('removes an existing item and reports missing ids', async () => {
    const area = createFakeArea();
    const added = await addWishlistItem(area, song(), NOW);
    if (added.status !== 'added') throw new Error('expected the item to be added');

    expect(await removeWishlistItem(area, added.item.id)).toBe(true);
    expect((await loadWishlist(area, NOW)).items).toEqual([]);
    expect(await removeWishlistItem(area, added.item.id)).toBe(false);
  });
});

describe('legacy and malformed data', () => {
  it('migrates a bare legacy array', async () => {
    const area = createFakeArea({ [WISHLIST_STORAGE_KEY]: [validItem()] });
    const snapshot = await loadWishlist(area, NOW);

    expect(snapshot.repaired).toBe(true);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]).toMatchObject({
      id: 'item-1',
      title: 'Blinding Lights',
      metadataOrigin: 'detected',
      updatedAt: NOW,
    });
  });

  it('accepts stringified JSON', () => {
    const snapshot = parseWishlist(JSON.stringify({ schemaVersion: 1, items: [validItem()] }), NOW);
    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.repaired).toBe(false);
  });

  it('recovers from unparseable JSON', () => {
    expect(parseWishlist('{ this is not json', NOW)).toEqual({ items: [], repaired: true });
  });

  it('recovers from an unexpected shape', () => {
    expect(parseWishlist({ nope: true }, NOW)).toEqual({ items: [], repaired: true });
    expect(parseWishlist(42, NOW)).toEqual({ items: [], repaired: true });
  });

  it('returns an empty snapshot for missing data', () => {
    expect(parseWishlist(undefined, NOW)).toEqual({ items: [], repaired: false });
  });

  it('drops invalid entries but keeps valid ones', () => {
    const snapshot = parseWishlist(
      {
        schemaVersion: 1,
        items: [
          validItem(),
          null,
          'nope',
          { id: 'bad', title: '' },
          { id: '', title: 'No id' },
        ],
      },
      NOW,
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.repaired).toBe(true);
  });

  it('drops duplicate ids and duplicate identities already in storage', () => {
    const snapshot = parseWishlist(
      {
        schemaVersion: 1,
        items: [
          validItem({ id: 'a', createdAt: NOW + 2 }),
          validItem({ id: 'b', createdAt: NOW + 1 }),
          validItem({ id: 'a', createdAt: NOW }),
        ],
      },
      NOW,
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.id).toBe('a');
    expect(snapshot.repaired).toBe(true);
  });

  it('clears a malformed video reference but keeps the song', () => {
    const snapshot = parseWishlist(
      {
        schemaVersion: 1,
        items: [
          validItem({
            video: {
              videoId: 'too-short',
              title: 'Bad',
              channelTitle: '',
              thumbnailUrl: null,
            },
          }),
        ],
      },
      NOW,
    );

    expect(snapshot.items).toHaveLength(1);
    expect(snapshot.items[0]?.video).toBeNull();
  });

  it('defaults missing timestamps instead of dropping the item', () => {
    const snapshot = parseWishlist({ schemaVersion: 1, items: [{ id: 'x', title: 'Song' }] }, NOW);
    expect(snapshot.items[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW, artist: null });
    expect(snapshot.repaired).toBe(false);
  });
});

describe('storage failures', () => {
  it('propagates read failures to the caller', async () => {
    const failing: StorageArea = {
      get: async () => {
        throw new Error('read failed');
      },
      set: async () => undefined,
      remove: async () => undefined,
    };

    await expect(loadWishlist(failing)).rejects.toThrow('read failed');
  });

  it('propagates write failures instead of reporting a save', async () => {
    const failing: StorageArea = {
      get: async () => undefined,
      set: async () => {
        throw new Error('write failed');
      },
      remove: async () => undefined,
    };

    await expect(addWishlistItem(failing, song(), NOW)).rejects.toThrow('write failed');
  });

  it('does not drop the item when a removal write fails', async () => {
    const area = createFakeArea({
      [WISHLIST_STORAGE_KEY]: { schemaVersion: 1, items: [validItem()] },
    });
    area.set = async () => {
      throw new Error('write failed');
    };

    await expect(removeWishlistItem(area, 'item-1')).rejects.toThrow('write failed');
    expect(area.data.get(WISHLIST_STORAGE_KEY)).toBeDefined();
  });
});
