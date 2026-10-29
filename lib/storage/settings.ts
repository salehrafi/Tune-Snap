import type { StorageArea } from './area';

export const SETTINGS_STORAGE_KEY = 'reeltune.settings.v1';

export interface ExtensionSettings {
  /** Empty string / null means "not configured". */
  youtubeApiKey: string | null;
}

const DEFAULT_SETTINGS: ExtensionSettings = { youtubeApiKey: null };

export function sanitizeApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function loadSettings(area: StorageArea): Promise<ExtensionSettings> {
  const raw = await area.get(SETTINGS_STORAGE_KEY);
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const record = raw as Record<string, unknown>;
  return { youtubeApiKey: sanitizeApiKey(record.youtubeApiKey) };
}

export async function saveApiKey(area: StorageArea, key: string | null): Promise<void> {
  const current = await loadSettings(area).catch(() => DEFAULT_SETTINGS);
  await area.set(SETTINGS_STORAGE_KEY, {
    ...current,
    youtubeApiKey: sanitizeApiKey(key),
  });
}

/** Optional key baked in at build time from `WXT_YOUTUBE_API_KEY`. */
export function getBuildApiKey(): string | null {
  return sanitizeApiKey(import.meta.env.WXT_YOUTUBE_API_KEY);
}

export type ApiKeySource = 'user' | 'build' | null;

export interface ResolvedApiKey {
  key: string | null;
  source: ApiKeySource;
}

/**
 * A key saved in Settings wins over the build-time key, so users can supply
 * their own without rebuilding the extension.
 */
export async function resolveApiKey(
  area: StorageArea,
  buildKey: string | null = getBuildApiKey(),
): Promise<ResolvedApiKey> {
  let stored: string | null = null;
  try {
    stored = (await loadSettings(area)).youtubeApiKey;
  } catch {
    stored = null;
  }
  if (stored) return { key: stored, source: 'user' };
  if (buildKey) return { key: buildKey, source: 'build' };
  return { key: null, source: null };
}
