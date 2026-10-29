import { describe, expect, it } from 'vitest';
import {
  isReelChangedMessage,
  isReelTrackRequest,
  isReelTrackResponse,
  requestReelTrackWithRetry,
  type ReelTrackResponse,
} from './messaging';

const VALID_RESPONSE = {
  ok: true,
  pageUrl: 'https://www.instagram.com/reel/ABC/',
  platform: 'instagram',
  reelUrl: 'https://www.instagram.com/reel/ABC/',
  isReel: true,
  reason: 'detected',
  track: {
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    confidence: 'high',
    originalAudio: false,
    evidence: 'audio-link',
  },
};

describe('isReelTrackRequest', () => {
  it('accepts the request message', () => {
    expect(isReelTrackRequest({ type: 'GET_REEL_TRACK' })).toBe(true);
  });

  it('rejects other messages and non-objects', () => {
    expect(isReelTrackRequest({ type: 'OTHER' })).toBe(false);
    expect(isReelTrackRequest(null)).toBe(false);
    expect(isReelTrackRequest('GET_REEL_TRACK')).toBe(false);
  });
});

describe('isReelChangedMessage', () => {
  it('accepts a valid live-watch message', () => {
    expect(
      isReelChangedMessage({ type: 'REEL_CHANGED', detection: VALID_RESPONSE }),
    ).toBe(true);
  });

  it('rejects wrong types and malformed detections', () => {
    expect(isReelChangedMessage({ type: 'OTHER', detection: VALID_RESPONSE })).toBe(false);
    expect(isReelChangedMessage({ type: 'REEL_CHANGED', detection: {} })).toBe(false);
    expect(isReelChangedMessage(null)).toBe(false);
  });
});

describe('isReelTrackResponse', () => {
  it('accepts a complete detected response', () => {
    expect(isReelTrackResponse(VALID_RESPONSE)).toBe(true);
  });

  it('accepts a response with no track and no platform', () => {
    expect(
      isReelTrackResponse({
        ...VALID_RESPONSE,
        platform: null,
        track: null,
        reason: 'no-metadata',
        reelUrl: null,
        isReel: false,
      }),
    ).toBe(true);
  });

  it('rejects responses missing required fields', () => {
    expect(isReelTrackResponse({})).toBe(false);
    expect(isReelTrackResponse(null)).toBe(false);
    expect(isReelTrackResponse({ ...VALID_RESPONSE, pageUrl: undefined })).toBe(false);
    expect(isReelTrackResponse({ ...VALID_RESPONSE, isReel: 'yes' })).toBe(false);
  });

  it('rejects unknown reasons, platforms and confidence values', () => {
    expect(isReelTrackResponse({ ...VALID_RESPONSE, reason: 'made-up' })).toBe(false);
    expect(isReelTrackResponse({ ...VALID_RESPONSE, platform: 'youtube' })).toBe(false);
    expect(
      isReelTrackResponse({
        ...VALID_RESPONSE,
        track: { ...VALID_RESPONSE.track, confidence: 'certain' },
      }),
    ).toBe(false);
  });

  it('rejects a malformed track payload', () => {
    expect(isReelTrackResponse({ ...VALID_RESPONSE, track: 'song' })).toBe(false);
    expect(isReelTrackResponse({ ...VALID_RESPONSE, track: { title: 42 } })).toBe(false);
    expect(
      isReelTrackResponse({
        ...VALID_RESPONSE,
        track: { ...VALID_RESPONSE.track, title: '   ' },
      }),
    ).toBe(false);
    expect(
      isReelTrackResponse({
        ...VALID_RESPONSE,
        track: { ...VALID_RESPONSE.track, artist: 42 },
      }),
    ).toBe(false);
  });
});

function response(overrides: Partial<ReelTrackResponse> = {}): ReelTrackResponse {
  return { ...(VALID_RESPONSE as unknown as ReelTrackResponse), ...overrides };
}

describe('requestReelTrackWithRetry', () => {
  const empty = response({ track: null, reason: 'no-metadata' });

  it('retries delayed rendering and returns the later detection', async () => {
    const answers = [empty, response()];
    let calls = 0;
    const delays: number[] = [];

    const result = await requestReelTrackWithRetry(1, {
      attempts: 2,
      retryDelayMs: 25,
      request: async () => answers[calls++] ?? null,
      delay: async (ms) => {
        delays.push(ms);
      },
    });

    expect(calls).toBe(2);
    expect(delays).toEqual([25]);
    expect(result?.track?.title).toBe('Blinding Lights');
  });

  it('does not retry when a track is already available', async () => {
    let calls = 0;
    const delays: number[] = [];

    const result = await requestReelTrackWithRetry(1, {
      attempts: 3,
      request: async () => {
        calls += 1;
        return response();
      },
      delay: async (ms) => {
        delays.push(ms);
      },
    });

    expect(calls).toBe(1);
    expect(delays).toEqual([]);
    expect(result?.track?.title).toBe('Blinding Lights');
  });

  it('does not retry when the content script is unreachable', async () => {
    let calls = 0;

    const result = await requestReelTrackWithRetry(1, {
      attempts: 3,
      request: async () => {
        calls += 1;
        return null;
      },
      delay: async () => undefined,
    });

    expect(calls).toBe(1);
    expect(result).toBeNull();
  });

  it('does not retry original audio', async () => {
    let calls = 0;
    const result = await requestReelTrackWithRetry(1, {
      attempts: 3,
      request: async () => {
        calls += 1;
        return response({ track: null, reason: 'original-audio' });
      },
      delay: async () => undefined,
    });

    expect(calls).toBe(1);
    expect(result?.reason).toBe('original-audio');
  });

  it('stops after the configured attempts and returns the last empty answer', async () => {
    let calls = 0;
    const delays: number[] = [];

    const result = await requestReelTrackWithRetry(1, {
      attempts: 3,
      retryDelayMs: 10,
      request: async () => {
        calls += 1;
        return empty;
      },
      delay: async (ms) => {
        delays.push(ms);
      },
    });

    expect(calls).toBe(3);
    expect(delays).toEqual([10, 10]);
    expect(result?.reason).toBe('no-metadata');
  });
});
