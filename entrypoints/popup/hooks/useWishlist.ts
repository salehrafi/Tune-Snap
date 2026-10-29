import { useCallback, useEffect, useState } from 'react';
import { localArea } from '@/lib/storage/browserArea';
import {
  addWishlistItem,
  loadWishlist,
  removeWishlistItem,
} from '@/lib/storage/wishlist';
import type { AddWishlistResult, NewWishlistItem, WishlistItem } from '@/lib/types/wishlist';
import { errorMessage } from '@/lib/utils/errors';

export type WishlistStatus = 'loading' | 'ready' | 'error';

/** Storage-backed wishlist state. All persistence stays out of the components. */
export function useWishlist() {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [status, setStatus] = useState<WishlistStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    try {
      const snapshot = await loadWishlist(localArea);
      setItems(snapshot.items);
      setError(null);
      setStatus('ready');
    } catch (cause) {
      setError(errorMessage(cause, 'Could not read your wishlist.'));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = useCallback(async (input: NewWishlistItem): Promise<AddWishlistResult> => {
    const result = await addWishlistItem(localArea, input);
    setItems((previous) => {
      if (result.status === 'added') return [result.item, ...previous];
      return previous.map((item) => (item.id === result.item.id ? result.item : item));
    });
    return result;
  }, []);

  const remove = useCallback(async (id: string): Promise<void> => {
    await removeWishlistItem(localArea, id);
    setItems((previous) => previous.filter((item) => item.id !== id));
  }, []);

  return { items, status, error, reload, add, remove };
}
