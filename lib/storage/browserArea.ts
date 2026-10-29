import { browser } from 'wxt/browser';
import type { StorageArea } from './area';

type AreaName = 'local' | 'session';

function getBrowserArea(name: AreaName) {
  const area = name === 'local' ? browser.storage.local : browser.storage.session;
  if (!area) throw new Error(`Extension ${name} storage is unavailable in this browser.`);
  return area;
}

export function createBrowserArea(name: AreaName): StorageArea {
  return {
    async get(key: string): Promise<unknown> {
      const result = (await getBrowserArea(name).get(key)) as Record<string, unknown> | undefined;
      return result?.[key];
    },
    async set(key: string, value: unknown): Promise<void> {
      await getBrowserArea(name).set({ [key]: value });
    },
    async remove(key: string): Promise<void> {
      await getBrowserArea(name).remove(key);
    },
  };
}

/** Persistent wishlist / settings storage. */
export const localArea: StorageArea = createBrowserArea('local');

/**
 * Session storage for the YouTube result cache. The browser clears it when it
 * closes, and it still works if the popup reopens.
 */
export function createSessionArea(): StorageArea | null {
  if (!browser.storage.session) return null;
  return createBrowserArea('session');
}
