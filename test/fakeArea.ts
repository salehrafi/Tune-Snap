import type { StorageArea } from '@/lib/storage/area';

export type FakeArea = StorageArea & { data: Map<string, unknown> };

/** In-memory StorageArea used by storage tests. */
export function createFakeArea(initial: Record<string, unknown> = {}): FakeArea {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    async get(key: string): Promise<unknown> {
      return data.get(key);
    },
    async set(key: string, value: unknown): Promise<void> {
      data.set(key, structuredClone(value));
    },
    async remove(key: string): Promise<void> {
      data.delete(key);
    },
  };
}
