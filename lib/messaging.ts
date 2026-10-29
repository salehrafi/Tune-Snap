import { browser } from 'wxt/browser';
import type { ReelDetection } from './adapters';
import type { DetectionConfidence, DetectedTrack } from './types/song';

export const GET_REEL_TRACK = 'GET_REEL_TRACK' as const;
export const REEL_WATCH_PORT = 'reeltune-reel-watch' as const;
export const REEL_CHANGED = 'REEL_CHANGED' as const;

export interface ReelTrackRequest {
  type: typeof GET_REEL_TRACK;
}

export interface ReelTrackResponse extends ReelDetection {
  ok: boolean;
}

export interface ReelChangedMessage {
  type: typeof REEL_CHANGED;
  detection: ReelTrackResponse;
}

const CONFIDENCES = new Set<DetectionConfidence>(['high', 'medium', 'low']);
const PLATFORMS = new Set(['instagram']);
const REASONS = new Set([
  'detected',
  'no-metadata',
  'original-audio',
  'ambiguous',
  'unsupported',
  'error',
]);

export function isReelChangedMessage(value: unknown): value is ReelChangedMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as { type?: unknown; detection?: unknown };
  return message.type === REEL_CHANGED && isReelTrackResponse(message.detection);
}

export function isReelTrackRequest(value: unknown): value is ReelTrackRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === GET_REEL_TRACK
  );
}

function isDetectedTrack(value: unknown): value is DetectedTrack {
  if (typeof value !== 'object' || value === null) return false;
  const track = value as Record<string, unknown>;
  return (
    typeof track.title === 'string' &&
    track.title.trim().length > 0 &&
    (track.artist === null || typeof track.artist === 'string') &&
    typeof track.confidence === 'string' &&
    CONFIDENCES.has(track.confidence as DetectionConfidence) &&
    typeof track.originalAudio === 'boolean' &&
    typeof track.evidence === 'string'
  );
}

/** Validate a message response, since page-derived data is untrusted. */
export function isReelTrackResponse(value: unknown): value is ReelTrackResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as Record<string, unknown>;
  if (typeof response.ok !== 'boolean') return false;
  if (typeof response.pageUrl !== 'string') return false;
  if (typeof response.isReel !== 'boolean') return false;
  if (typeof response.reason !== 'string' || !REASONS.has(response.reason)) return false;
  if (
    response.platform !== null &&
    (typeof response.platform !== 'string' || !PLATFORMS.has(response.platform))
  ) {
    return false;
  }
  if (response.reelUrl !== null && typeof response.reelUrl !== 'string') return false;
  if (response.track !== null && !isDetectedTrack(response.track)) return false;
  return true;
}

/**
 * Ask the content script in the given tab for the current Reel. Resolves to
 * `null` when the script is missing (for example a tab opened before the
 * extension was installed) or does not answer in time.
 */
export async function requestReelTrack(
  tabId: number,
  timeoutMs = 6000,
): Promise<ReelTrackResponse | null> {

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const response = await Promise.race([
      browser.tabs.sendMessage(tabId, { type: GET_REEL_TRACK } satisfies ReelTrackRequest),
      timeout,
    ]);
    return isReelTrackResponse(response) ? response : null;
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface ReelTrackRetryOptions {
  /** Total attempts, including the first one. Defaults to 3. */
  attempts?: number;
  /** Delay between attempts while waiting for delayed rendering. Defaults to 400ms. */
  retryDelayMs?: number;
  request?: (tabId: number) => Promise<ReelTrackResponse | null>;
  delay?: (ms: number) => Promise<void>;
}

/**
 * Ask the content script for the current Reel, retrying briefly when the page
 * is still rendering its music label.
 *
 * Only a reachable content script that reports `no-metadata` is retried.
 * Missing scripts and definite answers (a detected track, original audio, or
 * an error) are returned immediately, so a stale result is never "waited for".
 */
export async function requestReelTrackWithRetry(
  tabId: number,
  options: ReelTrackRetryOptions = {},
): Promise<ReelTrackResponse | null> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 400);
  const request = options.request ?? requestReelTrack;
  const delay = options.delay ?? sleep;

  let last: ReelTrackResponse | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await request(tabId);

    if (!last) return null;
    if (last.track) return last;
    if (last.reason !== 'no-metadata') return last;

    if (attempt < attempts - 1) await delay(retryDelayMs);
  }

  return last;
}
