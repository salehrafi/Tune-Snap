import { describe, expect, it, vi } from 'vitest';
import { fetchYouTubeVideos } from './client';

const OFFICIAL = {
  id: { videoId: '4NRXx6U8ABQ' },
  snippet: {
    title: 'The Weeknd - Blinding Lights (Official Video)',
    channelTitle: 'The Weeknd',
    publishedAt: '2019-11-29T10:00:00Z',
    thumbnails: {
      medium: { url: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg' },
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('fetchYouTubeVideos', () => {
  it('requests only the fields the popup needs', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      jsonResponse({ items: [OFFICIAL] }),
    );

    await fetchYouTubeVideos('The Weeknd Blinding Lights', {
      apiKey: 'TEST_KEY',
      fetchImpl,
      maxResults: 5,
    });

    const call = fetchImpl.mock.calls[0];
    expect(call).toBeDefined();
    const url = new URL(call?.[0] ?? '');

    expect(url.origin + url.pathname).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(url.searchParams.get('part')).toBe('snippet');
    expect(url.searchParams.get('type')).toBe('video');
    expect(url.searchParams.get('maxResults')).toBe('5');
    expect(url.searchParams.get('q')).toBe('The Weeknd Blinding Lights');
    expect(url.searchParams.get('key')).toBe('TEST_KEY');
    expect(url.searchParams.get('fields')).toContain('snippet');
    expect([...url.searchParams.keys()].sort()).toEqual([
      'fields',
      'key',
      'maxResults',
      'part',
      'q',
      'type',
    ]);
    expect(call?.[1]?.method).toBe('GET');
  });

  it('parses results into the internal video shape', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ items: [OFFICIAL] }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.videos).toEqual([
      {
        videoId: '4NRXx6U8ABQ',
        title: 'The Weeknd - Blinding Lights (Official Video)',
        channelTitle: 'The Weeknd',
        thumbnailUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/mqdefault.jpg',
        publishedAt: '2019-11-29T10:00:00Z',
      },
    ]);
  });

  it('skips malformed items instead of failing the whole search', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse({
          items: [
            OFFICIAL,
            { id: {}, snippet: {} },
            { id: { videoId: 'short' }, snippet: { title: 'Too short id' } },
            null,
            { id: { videoId: 'dQw4w9WgXcQ' }, snippet: { title: '   ' } },
          ],
        }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.videoId).toBe('4NRXx6U8ABQ');
  });

  it('falls back to another thumbnail size and tolerates a missing channel', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse({
          items: [
            {
              id: { videoId: 'dQw4w9WgXcQ' },
              snippet: {
                title: '  Song title  ',
                thumbnails: { default: { url: 'https://i.ytimg.com/default.jpg' } },
              },
            },
          ],
        }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.videos[0]).toMatchObject({
      title: 'Song title',
      channelTitle: '',
      thumbnailUrl: 'https://i.ytimg.com/default.jpg',
      publishedAt: null,
    });
  });

  it('treats a missing items array as no results', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({}),
    });

    expect(result).toEqual({ ok: true, videos: [] });
  });

  it('rejects an items value that is not an array', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => jsonResponse({ items: 'nope' }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-response' });
  });

  it('maps quota exhaustion to a quota error', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse(
          {
            error: {
              status: 'RESOURCE_EXHAUSTED',
              errors: [{ reason: 'quotaExceeded' }],
            },
          },
          403,
        ),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('quota-exceeded');
    expect(result.message).toMatch(/quota/i);
  });

  it('maps rejected keys to a configuration error', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () =>
        jsonResponse(
          { error: { status: 'INVALID_ARGUMENT', errors: [{ reason: 'keyInvalid' }] } },
          400,
        ),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-key');
    expect(result.message).toMatch(/API key/i);
  });

  it('maps other HTTP failures', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => new Response('', { status: 500 }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'http-error' });
  });

  it('rejects an unreadable success body', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => new Response('not json', { status: 200 }),
    });

    expect(result).toMatchObject({ ok: false, reason: 'invalid-response' });
  });

  it('maps network exceptions to a network error', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });

    expect(result).toMatchObject({ ok: false, reason: 'network' });
    if (!result.ok) expect(result.message).toMatch(/connection/i);
  });

  it('maps timeouts to a network error with a timeout message', async () => {
    const result = await fetchYouTubeVideos('q', {
      apiKey: 'k',
      fetchImpl: async () => {
        throw new DOMException('The operation timed out.', 'TimeoutError');
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('network');
    expect(result.message).toMatch(/too long/i);
  });
});
