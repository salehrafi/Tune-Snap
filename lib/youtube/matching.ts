import type { MatchSignal, RankedVideo } from '@/lib/types/youtube';
import { normalizeForMatch, normalizeWhitespace, toMatchTokens } from '@/lib/utils/text';
import type { YouTubeVideo } from './types';

export interface SongQuery {
  title: string;
  artist: string | null;
}

/** Search YouTube with both the artist and the title, artist first. */
export function buildSearchQuery(song: SongQuery): string {
  const title = normalizeWhitespace(song.title);
  const artist = song.artist ? normalizeWhitespace(song.artist) : '';
  return artist ? `${artist} ${title}` : title;
}

/**
 * Words that describe a different recording of a song. They are only
 * penalized when the user's own query does not mention them.
 */
const PENALTIES: ReadonlyArray<{ tokens: readonly string[]; penalty: number }> = [
  { tokens: ['karaoke'], penalty: 0.5 },
  { tokens: ['reaction'], penalty: 0.5 },
  { tokens: ['tutorial'], penalty: 0.5 },
  { tokens: ['parody'], penalty: 0.45 },
  { tokens: ['lesson'], penalty: 0.4 },
  { tokens: ['cover'], penalty: 0.4 },
  { tokens: ['full', 'album'], penalty: 0.4 },
  { tokens: ['1', 'hour'], penalty: 0.35 },
  { tokens: ['nightcore'], penalty: 0.35 },
  { tokens: ['sped', 'up'], penalty: 0.35 },
  { tokens: ['slowed'], penalty: 0.3 },
  { tokens: ['reverb'], penalty: 0.3 },
  { tokens: ['instrumental'], penalty: 0.3 },
  { tokens: ['loop'], penalty: 0.3 },
  { tokens: ['remix'], penalty: 0.25 },
  { tokens: ['mashup'], penalty: 0.25 },
  { tokens: ['concert'], penalty: 0.2 },
  { tokens: ['live'], penalty: 0.2 },
];

/** Version descriptors that should be matched when the user asked for them. */
const VERSION_TERMS: ReadonlyArray<readonly string[]> = [
  ['remix'],
  ['live'],
  ['cover'],
  ['acoustic'],
  ['instrumental'],
  ['sped', 'up'],
  ['slowed'],
  ['nightcore'],
  ['extended'],
];

function tokenCoverage(needleTokens: readonly string[], haystack: Set<string>): number {
  if (needleTokens.length === 0) return 0;
  let hits = 0;
  for (const token of needleTokens) {
    if (haystack.has(token)) hits += 1;
  }
  return hits / needleTokens.length;
}

/** YouTube auto-generates "<Artist> - Topic" channels for official audio. */
export function isTopicChannel(channelTitle: string): boolean {
  return /-\s*topic$/i.test(channelTitle.trim());
}

export function isVevoChannel(channelTitle: string): boolean {
  return /vevo$/i.test(channelTitle.trim());
}

/**
 * Score how likely a result is the song the user asked for.
 *
 * The score is evidence-based: song-title token coverage, artist mention, and
 * channel-name matches. It is never a statement that a video is "official".
 */
export function scoreVideo(video: YouTubeVideo, song: SongQuery): RankedVideo {
  const titleTokens = toMatchTokens(song.title);
  const artistTokens = song.artist ? toMatchTokens(song.artist) : [];
  const normalizedTitle = normalizeForMatch(song.title);
  const normalizedArtist = song.artist ? normalizeForMatch(song.artist) : '';
  const videoTitle = normalizeForMatch(video.title);
  const channel = normalizeForMatch(video.channelTitle);
  const videoTitleTokens = new Set(toMatchTokens(video.title));
  const channelTokens = new Set(toMatchTokens(video.channelTitle));

  const signals = new Set<MatchSignal>();
  let score = 0;

  const titleCoverage = tokenCoverage(titleTokens, videoTitleTokens);
  score += titleCoverage * 0.5;
  if (titleCoverage === 1 && titleTokens.length > 0) signals.add('title-match');
  if (normalizedTitle.length >= 3 && videoTitle.includes(normalizedTitle)) score += 0.05;

  if (artistTokens.length > 0) {
    const artistInTitle = tokenCoverage(artistTokens, videoTitleTokens);
    score += artistInTitle * 0.15;
    if (artistInTitle === 1) signals.add('artist-in-title');

    const artistInChannel = tokenCoverage(artistTokens, channelTokens);
    score += artistInChannel * 0.2;

    const channelIsArtist =
      channel === normalizedArtist || channel.startsWith(`${normalizedArtist} `);
    if (channelIsArtist) {
      score += 0.08;
      signals.add('artist-channel');
    }
    if (isTopicChannel(video.channelTitle) && artistInChannel === 1) {
      score += 0.12;
      signals.add('topic-channel');
    }
    if (isVevoChannel(video.channelTitle) && artistInChannel === 1) {
      score += 0.06;
      signals.add('vevo-channel');
    }
  }

  const queryTokens = new Set(toMatchTokens(`${normalizedTitle} ${normalizedArtist}`.trim()));

  // If the user asked for a specific version (remix, live, ...), prefer
  // results that mention it and push back the ones that do not.
  for (const tokens of VERSION_TERMS) {
    if (!tokens.every((token) => queryTokens.has(token))) continue;
    const inVideo = tokens.every((token) => videoTitleTokens.has(token));
    score += inVideo ? 0.12 : -0.25;
  }

  for (const { tokens, penalty } of PENALTIES) {
    const inVideo = tokens.every((token) => videoTitleTokens.has(token));
    if (!inVideo) continue;
    const inQuery = tokens.every((token) => queryTokens.has(token));
    if (inQuery) continue;
    score -= penalty;
  }

  const clamped = Math.max(0, Math.min(1, score));
  return {
    ...video,
    score: Math.round(clamped * 1000) / 1000,
    signals: [...signals],
  };
}

/** Score, de-duplicate by video id, and sort best-first. */
export function rankVideos(
  videos: readonly YouTubeVideo[],
  song: SongQuery,
): RankedVideo[] {
  const byId = new Map<string, RankedVideo>();
  for (const video of videos) {
    const ranked = scoreVideo(video, song);
    const existing = byId.get(ranked.videoId);
    if (!existing || ranked.score > existing.score) byId.set(ranked.videoId, ranked);
  }
  return [...byId.values()].sort((a, b) => b.score - a.score);
}

/**
 * Only auto-open a result when there is clear evidence (artist channel or
 * artist in the title) and it is meaningfully ahead of the runner-up.
 * Otherwise the popup shows the list and lets the user choose.
 */
export function isConfidentMatch(ranked: readonly RankedVideo[]): boolean {
  const best = ranked[0];
  if (!best) return false;
  if (best.score < 0.72) return false;
  if (best.signals.length === 0) return false;
  const runnerUp = ranked[1];
  if (runnerUp && best.score - runnerUp.score < 0.12) return false;
  return true;
}

/** Short label for the evidence badges shown on a result. */
export function signalLabel(signal: MatchSignal): string | null {
  switch (signal) {
    case 'artist-channel':
      return 'Artist channel';
    case 'topic-channel':
      return 'Topic channel';
    case 'vevo-channel':
      return 'VEVO channel';
    case 'artist-in-title':
      return 'Artist in title';
    default:
      return null;
  }
}
