import { describe, expect, it } from 'vitest';
import type { YouTubeVideo } from './types';
import {
  buildSearchQuery,
  isConfidentMatch,
  isTopicChannel,
  isVevoChannel,
  rankVideos,
} from './matching';

const SONG = { title: 'Blinding Lights', artist: 'The Weeknd' };

function video(id: string, title: string, channelTitle: string): YouTubeVideo {
  return {
    videoId: id,
    title,
    channelTitle,
    thumbnailUrl: null,
    publishedAt: null,
  };
}

describe('buildSearchQuery', () => {
  it('searches with artist and title', () => {
    expect(buildSearchQuery(SONG)).toBe('The Weeknd Blinding Lights');
  });

  it('uses only the title when the artist is unknown', () => {
    expect(buildSearchQuery({ title: 'Blinding Lights', artist: null })).toBe('Blinding Lights');
  });
});

describe('channel helpers', () => {
  it('detects Topic and VEVO channels', () => {
    expect(isTopicChannel('The Weeknd - Topic')).toBe(true);
    expect(isTopicChannel('The Weeknd')).toBe(false);
    expect(isVevoChannel('TheWeekndVEVO')).toBe(true);
    expect(isVevoChannel('The Weeknd')).toBe(false);
  });
});

describe('rankVideos', () => {
  const official = video(
    'official001',
    'The Weeknd - Blinding Lights (Official Video)',
    'The Weeknd',
  );
  const lyric = video('lyrics00001', 'Blinding Lights (Lyrics)', '7clouds');
  const cover = video('cover000001', 'Blinding Lights - Cover', 'Random Singer');
  const remix = video('remix000001', 'Blinding Lights (Remix)', 'DJ Somebody');

  it('ranks an official artist upload above lyric and cover uploads', () => {
    const ranked = rankVideos([cover, lyric, official], SONG);

    expect(ranked.map((item) => item.videoId)).toEqual([
      'official001',
      'lyrics00001',
      'cover000001',
    ]);
    expect(ranked[0]?.signals).toContain('artist-channel');
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? 1);
  });

  it('penalizes covers and remixes that the user did not ask for', () => {
    const ranked = rankVideos([official, cover, remix], SONG);
    const officialScore = ranked.find((item) => item.videoId === 'official001')?.score ?? 0;
    const coverScore = ranked.find((item) => item.videoId === 'cover000001')?.score ?? 0;
    const remixScore = ranked.find((item) => item.videoId === 'remix000001')?.score ?? 0;

    expect(officialScore).toBeGreaterThan(coverScore);
    expect(officialScore).toBeGreaterThan(remixScore);
  });

  it('prefers the remix when the song title contains "Remix"', () => {
    const ranked = rankVideos([official, remix], {
      title: 'Blinding Lights (Remix)',
      artist: 'The Weeknd',
    });

    expect(ranked[0]?.videoId).toBe('remix000001');
  });

  it('de-duplicates the same video id', () => {
    const ranked = rankVideos([official, { ...official, title: 'Duplicate' }], SONG);
    expect(ranked).toHaveLength(1);
  });

  it('gives Topic channels an official-audio signal without calling them official', () => {
    const topic = video(
      'topic000001',
      'Blinding Lights',
      'The Weeknd - Topic',
    );
    const ranked = rankVideos([topic], SONG);

    expect(ranked[0]?.signals).toContain('topic-channel');
    expect(ranked[0]?.signals).not.toContain('official');
  });
});

describe('isConfidentMatch', () => {
  const official = video(
    'official001',
    'The Weeknd - Blinding Lights (Official Video)',
    'The Weeknd',
  );
  const lyric = video('lyrics00001', 'Blinding Lights (Lyrics)', '7clouds');

  it('accepts a clear artist-channel match', () => {
    expect(isConfidentMatch(rankVideos([official, lyric], SONG))).toBe(true);
  });

  it('refuses to auto-pick without an artist', () => {
    const ranked = rankVideos([official, lyric], { title: 'Blinding Lights', artist: null });
    expect(isConfidentMatch(ranked)).toBe(false);
  });

  it('refuses to auto-pick when the top two results are close', () => {
    const topic = video('topic000001', 'Blinding Lights', 'The Weeknd - Topic');
    const ranked = rankVideos([official, topic], SONG);
    expect(isConfidentMatch(ranked)).toBe(false);
  });

  it('refuses to auto-pick a plain lyric upload', () => {
    const ranked = rankVideos([lyric], SONG);
    expect(isConfidentMatch(ranked)).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(isConfidentMatch([])).toBe(false);
  });
});
