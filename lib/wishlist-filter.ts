import type { WishlistItem } from '@/lib/types/wishlist';
import { normalizeForMatch } from '@/lib/utils/text';

/** Case/accent-insensitive filter over saved title and artist. */
export function filterWishlist(items: WishlistItem[], query: string): WishlistItem[] {
  const needle = normalizeForMatch(query);
  if (!needle) return items;
  return items.filter((item) => {
    const haystack = normalizeForMatch(`${item.title} ${item.artist ?? ''}`);
    return haystack.includes(needle);
  });
}
