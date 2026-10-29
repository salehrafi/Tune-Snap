import type { ParsedSongText } from '@/lib/adapters/types';
import { normalizeWhitespace } from '@/lib/utils/text';
import type { EvidenceInput } from './types';

interface MusicRecord {
  title: string;
  artist: string | null;
  audioId: string | null;
  scriptIndex: number;
  start: number;
  /** JSON-LD is only loosely associated unless DOM evidence corroborates it. */
  contextHint?: number;
}

const MUSIC_KEYS = ['music_asset_info', 'music_info'] as const;
const MAX_SCRIPT_BYTES = 4_000_000;
const MAX_TOTAL_BYTES = 8_000_000;

function reelIdFromUrl(url: URL): string | null {
  const match = /^\/reels?\/([A-Za-z0-9_-]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

function stringField(
  record: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const normalized = normalizeWhitespace(value);
      if (normalized.length > 0) return normalized;
    }
  }
  return null;
}

function idField(record: Record<string, unknown>): string | null {
  for (const key of ['audio_cluster_id', 'audio_asset_id', 'audio_id', 'cluster_id']) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** Extract one balanced JSON object, respecting strings and escapes. */
function balancedObject(text: string, start: number): string | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  const limit = Math.min(text.length, start + 120_000);

  for (let index = start; index < limit; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function objectsForKey(text: string, key: string): Array<{ start: number; value: unknown }> {
  const marker = `"${key}"`;
  const objects: Array<{ start: number; value: unknown }> = [];
  let cursor = 0;

  while (cursor < text.length) {
    const keyIndex = text.indexOf(marker, cursor);
    if (keyIndex < 0) break;
    const colon = text.indexOf(':', keyIndex + marker.length);
    if (colon < 0) break;
    let valueStart = colon + 1;
    while (valueStart < text.length && /\s/.test(text[valueStart] as string)) {
      valueStart += 1;
    }
    if (text[valueStart] !== '{') {
      cursor = valueStart;
      continue;
    }
    const brace = valueStart;
    const raw = balancedObject(text, brace);
    if (!raw) {
      cursor = keyIndex + marker.length;
      continue;
    }
    try {
      objects.push({ start: brace, value: JSON.parse(raw) });
    } catch {
      // Ignore malformed page data and keep looking.
    }
    cursor = brace + raw.length;
  }

  return objects;
}

function lastCodeBefore(text: string, index: number): string | null {
  const window = text.slice(Math.max(0, index - 8_000), index);
  const matches = [...window.matchAll(/"code":"([A-Za-z0-9_-]+)"/g)];
  return matches.at(-1)?.[1] ?? null;
}

function contextMatches(
  scriptText: string,
  recordStart: number,
  reelId: string | null,
): boolean {
  if (!reelId) return false;
  if (lastCodeBefore(scriptText, recordStart) === reelId) return true;
  const prefix = scriptText.slice(Math.max(0, recordStart - 8_000), recordStart);
  return (
    prefix.includes(`"id":"${reelId}"`) || prefix.includes(`"video_id":"${reelId}"`)
  );
}

function toParsed(title: string, artist: string | null): ParsedSongText {
  return {
    title,
    artist,
    confidence: artist ? 'medium' : 'low',
    originalAudio: false,
  };
}

/**
 * Read music records embedded in the page's JSON script data.
 *
 * This is page-local structured metadata, not a private API request. The
 * records are only trusted strongly when their audio id or nearby Reel code
 * matches the current URL; otherwise they are weak evidence at best. Shapes
 * change, so every read is defensive and malformed data is ignored.
 */
export function collectStructuredEvidence(
  document: Document,
  url: URL,
  audioIds: readonly string[],
): EvidenceInput[] {
  const reelId = reelIdFromUrl(url);
  const records: MusicRecord[] = [];
  let totalBytes = 0;

  for (const [scriptIndex, script] of Array.from(document.querySelectorAll('script')).entries()) {
    const text = script.textContent ?? '';
    if (!text || !text.includes('"music_asset_info"')) continue;
    if (text.length > MAX_SCRIPT_BYTES) continue;
    totalBytes += text.length;
    if (totalBytes > MAX_TOTAL_BYTES) break;

    for (const key of MUSIC_KEYS) {
      for (const object of objectsForKey(text, key)) {
        if (typeof object.value !== 'object' || object.value === null) continue;
        const record = object.value as Record<string, unknown>;
        const title = stringField(record, [
          'title',
          'song_title',
          'song_name',
          'track_name',
          'music_title',
          'name',
        ]);
        if (!title) continue;
        const artist = stringField(record, [
          'display_artist',
          'artist',
          'artist_name',
          'subtitle',
          'byline',
        ]);
        records.push({
          title,
          artist,
          audioId: idField(record),
          scriptIndex,
          start: object.start,
        });
      }
    }

    // JSON-LD MusicRecording (rare on these platforms, cheap to support).
    if (script.type === 'application/ld+json') {
      try {
        const parsed = JSON.parse(text) as unknown;
        const addJsonLd = (value: unknown): void => {
          if (Array.isArray(value)) {
            value.forEach(addJsonLd);
            return;
          }
          if (typeof value !== 'object' || value === null) return;
          const record = value as Record<string, unknown>;
          const type = record['@type'];
          const isMusic =
            type === 'MusicRecording' ||
            (Array.isArray(type) && type.includes('MusicRecording'));
          if (!isMusic) return;
          const title = stringField(record, ['name']);
          if (!title) return;
          let artist: string | null = null;
          const byArtist = record.byArtist;
          if (typeof byArtist === 'string') {
            artist = normalizeWhitespace(byArtist);
          } else if (typeof byArtist === 'object' && byArtist !== null) {
            const artistRecord = byArtist as Record<string, unknown>;
            artist = stringField(artistRecord, ['name']);
          }
          records.push({
            title,
            artist,
            audioId: null,
            scriptIndex,
            start: 0,
            contextHint: 0.4,
          });
        };
        addJsonLd(parsed);
      } catch {
        // Ignore malformed JSON-LD.
      }
    }
  }

  // De-duplicate records repeated inside nested music objects.
  const unique = new Map<string, MusicRecord>();
  for (const record of records) {
    const key = `${record.audioId ?? ''}|${record.title.toLowerCase()}|${(record.artist ?? '').toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, record);
  }
  const list = [...unique.values()];
  if (list.length === 0) return [];

  const scripts = Array.from(document.querySelectorAll('script'));

  return list.map((record) => {
    const scriptText = scripts[record.scriptIndex]?.textContent ?? '';
    const audioMatch = Boolean(record.audioId && audioIds.includes(record.audioId));
    const codeMatch = contextMatches(scriptText, record.start, reelId);
    const matched = audioMatch || codeMatch;
    const contextHint = matched
      ? 1
      : (record.contextHint ?? (list.length === 1 ? 0.65 : 0.12));

    const originalAudio = /^original (?:audio|sound|song)$/i.test(record.title);

  return {
      source: 'structured-music' as const,
      text: [record.title, record.artist].filter(Boolean).join(' · '),
      parsed: originalAudio
        ? { title: '', artist: null, confidence: 'low', originalAudio: true }
        : toParsed(record.title, record.artist),
      element: null,
      href: null,
      allowByPattern: false,
      reelMatch: matched,
      contextHint,
      correlationKey: `structured:${record.scriptIndex}:${record.audioId ?? record.title}`,
    };
  });
}
