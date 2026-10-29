import { describe, expect, it } from 'vitest';
import { createFakeArea } from '@/test/fakeArea';
import type { StorageArea } from './area';
import {
  loadSettings,
  resolveApiKey,
  sanitizeApiKey,
  saveApiKey,
  SETTINGS_STORAGE_KEY,
} from './settings';

describe('sanitizeApiKey', () => {
  it('trims strings and treats blanks as missing', () => {
    expect(sanitizeApiKey('  AIzaExample  ')).toBe('AIzaExample');
    expect(sanitizeApiKey('   ')).toBeNull();
    expect(sanitizeApiKey('')).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(sanitizeApiKey(null)).toBeNull();
    expect(sanitizeApiKey(42)).toBeNull();
    expect(sanitizeApiKey({ key: 'x' })).toBeNull();
  });
});

describe('settings storage', () => {
  it('returns no key by default', async () => {
    const area = createFakeArea();
    expect(await loadSettings(area)).toEqual({ youtubeApiKey: null });
  });

  it('saves and reloads a trimmed key', async () => {
    const area = createFakeArea();
    await saveApiKey(area, '  AIzaExample  ');
    expect(await loadSettings(area)).toEqual({ youtubeApiKey: 'AIzaExample' });
  });

  it('clears a saved key', async () => {
    const area = createFakeArea();
    await saveApiKey(area, 'AIzaExample');
    await saveApiKey(area, null);
    expect(await loadSettings(area)).toEqual({ youtubeApiKey: null });
  });

  it('ignores malformed stored settings', async () => {
    const area = createFakeArea({ [SETTINGS_STORAGE_KEY]: 'not an object' });
    expect(await loadSettings(area)).toEqual({ youtubeApiKey: null });

    const weird = createFakeArea({ [SETTINGS_STORAGE_KEY]: { youtubeApiKey: 99 } });
    expect(await loadSettings(weird)).toEqual({ youtubeApiKey: null });
  });
});

describe('resolveApiKey', () => {
  it('prefers the key saved in this browser over the build-time key', async () => {
    const area = createFakeArea();
    await saveApiKey(area, 'user-key');
    expect(await resolveApiKey(area, 'build-key')).toEqual({ key: 'user-key', source: 'user' });
  });

  it('falls back to the build-time key', async () => {
    const area = createFakeArea();
    expect(await resolveApiKey(area, 'build-key')).toEqual({ key: 'build-key', source: 'build' });
  });

  it('reports when no key exists', async () => {
    const area = createFakeArea();
    expect(await resolveApiKey(area, null)).toEqual({ key: null, source: null });
  });

  it('still uses the build key when settings cannot be read', async () => {
    const failing: StorageArea = {
      get: async () => {
        throw new Error('storage unavailable');
      },
      set: async () => undefined,
      remove: async () => undefined,
    };
    expect(await resolveApiKey(failing, 'build-key')).toEqual({ key: 'build-key', source: 'build' });
  });
});
