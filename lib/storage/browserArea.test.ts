import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBrowserArea, localArea } from './browserArea';

describe('browser storage area', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('round-trips values through extension local storage', async () => {
    await localArea.set('tune-snap.test', { hello: 'world' });
    expect(await localArea.get('tune-snap.test')).toEqual({ hello: 'world' });

    await localArea.remove('tune-snap.test');
    expect(await localArea.get('tune-snap.test')).toBeUndefined();
  });

  it('returns undefined for missing keys', async () => {
    expect(await localArea.get('tune-snap.missing')).toBeUndefined();
  });

  it('still uses the same underlying storage when created separately', async () => {
    const area = createBrowserArea('local');
    await localArea.set('shared', 42);
    expect(await area.get('shared')).toBe(42);
  });
});

