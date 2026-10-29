/**
 * Tiny abstraction over extension storage so persistence can be unit tested
 * without the extension runtime.
 */
export interface StorageArea {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
