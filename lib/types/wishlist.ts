import type { MetadataOrigin, SongSource } from './song';
import type { SavedVideo } from './youtube';

/** Bump when the persisted shape changes and add a migration in storage/wishlist.ts. */
export const WISHLIST_SCHEMA_VERSION = 1;

export interface WishlistItem {
  /** Stable UUID, used as the React key and for future playlist sync mapping. */
  id: string;
  title: string;
  artist: string | null;
  source: SongSource;
  reelUrl: string | null;
  /** Whether the title/artist came from the page, the user, or a correction. */
  metadataOrigin: MetadataOrigin;
  createdAt: number;
  updatedAt: number;
  /** Set only after the user explicitly played or picked a YouTube video. */
  video: SavedVideo | null;
}

export interface WishlistDatabase {
  schemaVersion: number;
  items: WishlistItem[];
}

export interface WishlistSnapshot {
  items: WishlistItem[];
  /** True when malformed or legacy entries had to be discarded/migrated. */
  repaired: boolean;
}

export interface NewWishlistItem {
  title: string;
  artist: string | null;
  source: SongSource;
  reelUrl: string | null;
  metadataOrigin: MetadataOrigin;
  video: SavedVideo | null;
}

export type AddWishlistResult =
  | { status: 'added'; item: WishlistItem }
  | {
      status: 'duplicate';
      item: WishlistItem;
      /** True when a missing YouTube match was filled in on the existing item. */
      attachedVideo: boolean;
    };
