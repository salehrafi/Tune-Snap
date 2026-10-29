import type { SearchFailureReason } from '@/lib/types/youtube';
import { normalizeWhitespace } from '@/lib/utils/text';
import type { FetchLike, YouTubeVideo } from './types';

const SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';
/** Only ask for the fields the popup renders. */
const FIELDS = 'items(id/videoId,snippet(title,channelTitle,publishedAt,thumbnails))';
const DEFAULT_MAX_RESULTS = 6;
const REQUEST_TIMEOUT_MS = 10_000;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type FetchVideosResult =
  | { ok: true; videos: YouTubeVideo[] }
  | { ok: false; reason: SearchFailureReason; message: string };

export interface FetchVideosOptions {
  apiKey: string;
  maxResults?: number;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
}

function failure(reason: SearchFailureReason, message: string): FetchVideosResult {
  return { ok: false, reason, message };
}

function parseThumbnail(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const thumbnails = value as Record<string, unknown>;
  for (const size of ['medium', 'high', 'default'] as const) {
    const entry = thumbnails[size];
    if (typeof entry === 'object' && entry !== null) {
      const url = (entry as { url?: unknown }).url;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
    }
  }
  return null;
}

function parseItem(value: unknown): YouTubeVideo | null {
  if (typeof value !== 'object' || value === null) return null;
  const item = value as Record<string, unknown>;
  const id = item.id;
  const snippet = item.snippet;
  if (typeof id !== 'object' || id === null) return null;
  if (typeof snippet !== 'object' || snippet === null) return null;

  const videoId = (id as { videoId?: unknown }).videoId;
  if (typeof videoId !== 'string' || !VIDEO_ID.test(videoId)) return null;

  const snippetRecord = snippet as Record<string, unknown>;
  const title =
    typeof snippetRecord.title === 'string' ? normalizeWhitespace(snippetRecord.title) : '';
  if (!title) return null;

  const channelTitle =
    typeof snippetRecord.channelTitle === 'string'
      ? normalizeWhitespace(snippetRecord.channelTitle)
      : '';
  const publishedAt =
    typeof snippetRecord.publishedAt === 'string' ? snippetRecord.publishedAt : null;

  return {
    videoId,
    title,
    channelTitle,
    thumbnailUrl: parseThumbnail(snippetRecord.thumbnails),
    publishedAt,
  };
}

function parseItems(payload: unknown): YouTubeVideo[] | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const items = (payload as { items?: unknown }).items;
  if (items === undefined) return [];
  if (!Array.isArray(items)) return null;
  const videos: YouTubeVideo[] = [];
  for (const item of items) {
    const video = parseItem(item);
    if (video) videos.push(video);
  }
  return videos;
}

async function mapHttpError(response: Response): Promise<FetchVideosResult> {
  let apiReason = '';
  let apiStatus = '';
  try {
    const payload = (await response.json()) as {
      error?: { status?: unknown; errors?: unknown };
    };
    const error = payload?.error;
    if (error && typeof error === 'object') {
      if (typeof error.status === 'string') apiStatus = error.status;
      if (Array.isArray(error.errors)) {
        const first = error.errors[0] as { reason?: unknown } | undefined;
        if (first && typeof first.reason === 'string') apiReason = first.reason;
      }
    }
  } catch {
    // Error bodies are optional.
  }

  const codes = `${apiReason} ${apiStatus}`;
  if (response.status === 429 || /quota|dailylimit|ratelimit/i.test(codes)) {
    return failure(
      'quota-exceeded',
      "YouTube's search quota is used up for now. Try again later or open YouTube search directly.",
    );
  }
  if (response.status === 400 || response.status === 401 || response.status === 403) {
    return failure(
      'invalid-key',
      'YouTube rejected the API key. Check the key and make sure the YouTube Data API v3 is enabled for it.',
    );
  }
  return failure('http-error', `YouTube search failed (HTTP ${response.status}).`);
}

/**
 * Call the YouTube Data API v3 search endpoint. Only `part`, `type`,
 * `maxResults`, `q`, `fields` and the API key are sent; no Reel URL, user
 * identity, or wishlist data leaves the browser.
 */
export async function fetchYouTubeVideos(
  query: string,
  options: FetchVideosOptions,
): Promise<FetchVideosResult> {
  const url = new URL(SEARCH_ENDPOINT);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(options.maxResults ?? DEFAULT_MAX_RESULTS));
  url.searchParams.set('q', query);
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('key', options.apiKey);

  const fetchImpl: FetchLike = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const signal = options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return failure(
      'network',
      timedOut
        ? 'YouTube took too long to respond. Try again.'
        : 'Could not reach YouTube. Check your connection and try again.',
    );
  }

  if (!response.ok) return mapHttpError(response);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failure('invalid-response', 'YouTube returned an unreadable response.');
  }

  const videos = parseItems(payload);
  if (videos === null) {
    return failure('invalid-response', 'YouTube returned an unexpected response.');
  }

  return { ok: true, videos };
}
